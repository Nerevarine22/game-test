'use client';

import { useEffect, useRef, useCallback } from 'react';

// ─── Constants ───────────────────────────────────────────────────────────────
const GAME_W = 390;
const GAME_H = 844;
const TOTAL_ARROWS = 3;

// Target rests at canvas center in world-space (offset 0,0).
// TARGET_X/Y are the WORLD-SPACE origin of the target — they never change.
// The visual position is TARGET_X + worldOffsetX, TARGET_Y + worldOffsetY.
const TARGET_X = GAME_W / 2;
const TARGET_Y = GAME_H / 2 - 40;
const TARGET_RADIUS = 90;

// How many canvas-px the world can shift per degree of tilt
const PX_PER_DEGREE = 5.5;

// Maximum world shift in either axis (keeps target always at least partially on screen)
const MAX_OFFSET_X = GAME_W * 0.38;
const MAX_OFFSET_Y = GAME_H * 0.28;

// Lerp smoothing factor per frame (higher = snappier)
const LERP_FACTOR = 0.10;

// Score ring radii (% of TARGET_RADIUS)
const RINGS = [
  { name: 'Bullseye', maxR: 0.15, score: 10, color: 0xffd700 },
  { name: 'Inner',    maxR: 0.45, score: 7,  color: 0xff3333 },
  { name: 'Middle',   maxR: 0.72, score: 5,  color: 0x3366ff },
  { name: 'Outer',    maxR: 1.00, score: 3,  color: 0xffffff },
];

// ─── Wind helper ─────────────────────────────────────────────────────────────
function randomWind() {
  const angle = Math.random() * Math.PI * 2;
  const speed = 30 + Math.random() * 70;
  return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
}

// ─── Color helper ────────────────────────────────────────────────────────────
function toHex(n) {
  return '#' + n.toString(16).padStart(6, '0');
}

// ─── Procedural texture generation ───────────────────────────────────────────
function generateTextures(scene) {
  // ── wind_arrow ───────────────────────────────────────────────────────────
  {
    const size = 32;
    const cvs  = document.createElement('canvas');
    cvs.width = size; cvs.height = size;
    const ctx  = cvs.getContext('2d');
    const cx   = size / 2, cy = size / 2;

    ctx.shadowColor = '#64ddff';
    ctx.shadowBlur  = 6;
    ctx.fillStyle   = '#64ddff';
    ctx.beginPath();
    ctx.moveTo(cx + 10, cy);
    ctx.lineTo(cx - 2, cy - 6);
    ctx.lineTo(cx - 2, cy - 2);
    ctx.lineTo(cx - 10, cy - 2);
    ctx.lineTo(cx - 10, cy + 2);
    ctx.lineTo(cx - 2, cy + 2);
    ctx.lineTo(cx - 2, cy + 6);
    ctx.closePath();
    ctx.fill();

    scene.textures.addCanvas('wind_arrow', cvs);
  }
  // ── volumetric_crosshair ────────────────────────────────────────────────
  {
    const size = 100;
    const cvs  = document.createElement('canvas');
    cvs.width = size; cvs.height = size;
    const ctx  = cvs.getContext('2d');
    const cx   = size / 2, cy = size / 2;

    // Volumetric shadow
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, 32, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#00e5ff';
    ctx.stroke();

    // Inner glow
    ctx.shadowColor = 'transparent';
    const grad = ctx.createRadialGradient(cx, cy, 26, cx, cy, 32);
    grad.addColorStop(0, 'rgba(0, 229, 255, 0)');
    grad.addColorStop(1, 'rgba(0, 229, 255, 0.4)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 32, 0, Math.PI * 2);
    ctx.fill();

    // Cross lines
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx - 48, cy); ctx.lineTo(cx - 18, cy);
    ctx.moveTo(cx + 18, cy); ctx.lineTo(cx + 48, cy);
    ctx.moveTo(cx, cy - 48); ctx.lineTo(cx, cy - 18);
    ctx.moveTo(cx, cy + 18); ctx.lineTo(cx, cy + 48);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = '#ff1744';
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 1.5, cy - 1.5, 1.5, 0, Math.PI * 2);
    ctx.fill();

    scene.textures.addCanvas('volumetric_crosshair', cvs);
  }
}

// ─── Main Scene ──────────────────────────────────────────────────────────────
function createArcheryScene(onGameFinished) {
  return class ArcheryScene extends globalThis.Phaser.Scene {
    constructor() { super({ key: 'ArcheryScene' }); }

    // ── State ──────────────────────────────────────────────────────────────
    wind       = { x: 0, y: 0 };
    arrowsLeft = TOTAL_ARROWS;
    totalScore = 0;
    shotsLog   = [];
    isFiring   = false;

    // World-pan state
    worldOffsetX   = 0;   // current interpolated world shift (px)
    worldOffsetY   = 0;
    targetOffsetX  = 0;   // desired world shift from drag
    targetOffsetY  = 0;

    // Drag-to-aim state
    isDrawing   = false;
    dragStartX  = 0;
    dragStartY  = 0;
    baseOffsetX = 0;
    baseOffsetY = 0;

    // Phaser game objects
    worldContainer = null;
    uiContainer  = null;
    skySprite     = null;
    horizonSprite = null;
    grassSprite   = null;
    shadowSprite  = null;
    standSprite  = null;
    targetSprite = null;
    arrowSprite  = null;
    bowSpr       = null;
    crosshairSpr = null;
    windText     = null;
    windArrow    = null;
    arrowsText   = null;
    scorePopup   = null;
    totalText    = null;

    // ── Preload ────────────────────────────────────────────────────────────
    preload() {
      this.load.image('sky_bg', '/assets/sky_bg.png');
      this.load.image('horizon', '/assets/horizon_silhouettes.png');
      this.load.image('grass_floor', '/assets/grass_floor.png');
      this.load.image('shadow', '/assets/shadow.png');
      this.load.image('target_stand', '/assets/target_stand.png');
      this.load.image('target_shield', '/assets/target_shield.png');
      this.load.image('bow_and_hand', '/assets/bow_and_hand.png');
      this.load.image('crosshair', '/assets/crosshair.png');
      this.load.image('arrow_shaft', '/assets/arrow_shaft.png');
    }

    // ── Create ─────────────────────────────────────────────────────────────
    create() {
      this.wind = randomWind();

      generateTextures(this);

      this.worldContainer = this.add.container(0, 0);
      this.uiContainer = this.add.container(0, 0).setDepth(200);

      // Layer 1 (Sky)
      this.skySprite = this.add.image(GAME_W / 2, GAME_H * 0.25, 'sky_bg').setOrigin(0.5, 0.5).setDisplaySize(GAME_W * 2, GAME_H);

      // Layer 2 (Horizon)
      this.horizonSprite = this.add.image(GAME_W / 2, GAME_H * 0.55, 'horizon').setOrigin(0.5, 1).setDisplaySize(GAME_W * 2, GAME_H * 0.3);

      // Layer 3 (Ground)
      this.grassSprite = this.add.image(GAME_W / 2, GAME_H * 0.775, 'grass_floor').setOrigin(0.5, 0.5).setDisplaySize(GAME_W * 2, GAME_H * 0.55);

      // Layer 4 (Drop Shadow)
      this.shadowSprite = this.add.image(TARGET_X, TARGET_Y + TARGET_RADIUS, 'shadow').setOrigin(0.5, 0.5).setAlpha(0.6).setDisplaySize(160, 40);

      // Layer 5 (Target Stand)
      this.standSprite = this.add.image(TARGET_X, TARGET_Y + TARGET_RADIUS, 'target_stand').setOrigin(0.5, 1).setDisplaySize(30, 200);

      // Layer 6 (Target Shield)
      this.targetSprite = this.add.image(TARGET_X, TARGET_Y, 'target_shield').setOrigin(0.5, 0.5).setDisplaySize(TARGET_RADIUS * 2, TARGET_RADIUS * 2);

      // Layer 7 (Dynamic Arrows)
      this.arrowSprite = this.add.image(0, 0, 'arrow_shaft').setVisible(false).setOrigin(0.5, 0);

      // Layer 8 (First-Person Bow)
      this.bowSpr = this.add.image(this.cameras.main.width, this.cameras.main.height, 'bow_and_hand').setOrigin(1, 1).setDepth(99).setDisplaySize(GAME_W * 0.5, GAME_H * 0.4);

      // Layer 9 (Crosshair)
      this.crosshairSpr = this.add.image(GAME_W / 2, GAME_H / 2, 'volumetric_crosshair').setOrigin(0.5, 0.5).setDepth(100);

      this.worldContainer.add([
        this.skySprite, this.horizonSprite, this.grassSprite,
        this.shadowSprite, this.standSprite, this.targetSprite,
        this.arrowSprite, this.crosshairSpr, this.bowSpr
      ]);

      // ── HUD ──────────────────────────────────────────────────────────────
      this.createHUD();

      // Setup UI camera to ignore world, and main camera to ignore UI
      this.cameras.main.ignore(this.uiContainer);
      this.uiCamera = this.cameras.add(0, 0, GAME_W, GAME_H);
      this.uiCamera.ignore(this.worldContainer);

      // ── Input: drag to aim, release to fire ──────────────────────────────
      this.input.on('pointerdown', this.onPointerDown, this);
      this.input.on('pointermove', this.onPointerMove, this);
      this.input.on('pointerup',   this.onPointerUp,   this);
      this.input.on('pointerout',  this.onPointerUp,   this); // Cancel draw if finger leaves canvas

      // ── Scene shutdown cleanup ────────────────────────────────────────────
      this.events.once('shutdown', this.cleanUp, this);
      this.events.once('destroy',  this.cleanUp, this);
    }



    // ── Update (called every frame) ────────────────────────────────────────
    update() {
      // Smooth-lerp world offset toward gyro target
      this.worldOffsetX = Phaser.Math.Linear(this.worldOffsetX, this.targetOffsetX, LERP_FACTOR);
      this.worldOffsetY = Phaser.Math.Linear(this.worldOffsetY, this.targetOffsetY, LERP_FACTOR);

      const ox = this.worldOffsetX;
      const oy = this.worldOffsetY;

      // Static world
      this.skySprite.setPosition(GAME_W / 2, GAME_H * 0.25);
      this.horizonSprite.setPosition(GAME_W / 2, GAME_H * 0.55);
      this.grassSprite.setPosition(GAME_W / 2, GAME_H * 0.775);

      this.shadowSprite.setPosition(TARGET_X, TARGET_Y + TARGET_RADIUS);
      this.targetSprite.setPosition(TARGET_X, TARGET_Y);
      this.standSprite.setPosition(TARGET_X, TARGET_Y + TARGET_RADIUS);

      // Crosshair moves instead (with inertia)
      const targetCrosshairX = GAME_W / 2 + ox;
      const targetCrosshairY = GAME_H / 2 + oy;

      if (this.crosshairX === undefined) {
        this.crosshairX = targetCrosshairX;
        this.crosshairY = targetCrosshairY;
      }

      this.crosshairX = Phaser.Math.Linear(this.crosshairX, targetCrosshairX, 0.08);
      this.crosshairY = Phaser.Math.Linear(this.crosshairY, targetCrosshairY, 0.08);

      this.crosshairSpr.setPosition(this.crosshairX, this.crosshairY);

      // Make the bow follow the crosshair (First-Person arms movement)
      const armOffsetX = this.crosshairX - (GAME_W / 2);
      const armOffsetY = this.crosshairY - (GAME_H / 2);
      this.bowSpr.setPosition(GAME_W + armOffsetX, GAME_H + armOffsetY);
      
      // Slight dynamic tilt based on arm movement
      this.bowSpr.setRotation(armOffsetX * 0.001);

      // Hide sight when firing
      if (this.isFiring) {
        this.crosshairSpr.setAlpha(0);
      } else {
        this.crosshairSpr.setAlpha(1);
      }
    }

    // ── Drag Input Handlers ────────────────────────────────────────────────
    onPointerDown(ptr) {
      if (this.isFiring || this.arrowsLeft <= 0) return;
      this.isDrawing = true;
      this.dragStartX = ptr.x;
      this.dragStartY = ptr.y;
      this.baseOffsetX = this.targetOffsetX;
      this.baseOffsetY = this.targetOffsetY;
      
      // Zoom in
      this.cameras.main.zoomTo(1.7, 300, 'Sine.easeOut');
    }

    onPointerMove(ptr) {
      if (!this.isDrawing) return;
      
      const dx = ptr.x - this.dragStartX;
      const dy = ptr.y - this.dragStartY;
      
      // Moving finger left (negative dx) should move world left (camera right)
      // Adjust sensitivity multiplier as needed (e.g., 1.5 for faster panning)
      const sensitivity = 1.2;
      const rawX = this.baseOffsetX + dx * sensitivity;
      const rawY = this.baseOffsetY + dy * sensitivity;
      
      this.targetOffsetX = Phaser.Math.Clamp(rawX, -MAX_OFFSET_X, MAX_OFFSET_X);
      this.targetOffsetY = Phaser.Math.Clamp(rawY, -MAX_OFFSET_Y, MAX_OFFSET_Y);
    }

    onPointerUp() {
      if (!this.isDrawing) return;
      this.isDrawing = false;
      
      // Zoom out
      this.cameras.main.zoomTo(1.0, 200, 'Sine.easeOut');

      // Fire on release
      this.fireArrow();
    }

    // ── Fire Arrow ─────────────────────────────────────────────────────────
    // The crosshair is always at canvas center (GAME_W/2, GAME_H/2).
    // The target's *visual* position under the crosshair is:
    //   TARGET_X + worldOffsetX, TARGET_Y + worldOffsetY
    // So the displacement from target-center to crosshair-center is:
    //   dx = (GAME_W/2) - (TARGET_X + worldOffsetX)
    //   dy = (GAME_H/2) - (TARGET_Y + worldOffsetY)
    // startX/startY are the canvas-space coords where the arrow is aimed,
    // which equals the crosshair center (GAME_W/2, GAME_H/2).
    // For scoring we measure the distance from the crosshair to the target center
    // in *world space* — identical to what the player sees.
    fireArrow() {
      if (this.arrowsLeft <= 0) return;
      this.arrowsLeft--;
      this.isFiring = true;
      this.updateArrowsText();

      // Snapshot world offset at moment of release
      const shotOffsetX = this.worldOffsetX;
      const shotOffsetY = this.worldOffsetY;

      // Crosshair canvas position
      const startX = this.crosshairX !== undefined ? this.crosshairX : GAME_W / 2 + shotOffsetX;
      const startY = this.crosshairY !== undefined ? this.crosshairY : GAME_H / 2 + shotOffsetY;

      // Arrow spawns relative to the moving bow
      const armOffsetX = this.crosshairX !== undefined ? this.crosshairX - (GAME_W / 2) : 0;
      const SPAWN_X = GAME_W / 2 + armOffsetX * 0.6;
      const SPAWN_Y = GAME_H + 30;

      const FLIGHT_MS    = 1000;
      const FLIGHT_S     = FLIGHT_MS / 1000;
      const GRAVITY_DROP = 40;
      const windX = this.wind.x * FLIGHT_S;
      const windY = this.wind.y * FLIGHT_S;

      // Final canvas-space impact (wind + gravity applied on top of aim point)
      const finalX = startX + windX;
      const finalY = startY + windY + GRAVITY_DROP;

      const ctrlX = Phaser.Math.Linear(SPAWN_X, finalX, 0.5) + windX * 0.5;
      const ctrlY = Phaser.Math.Linear(SPAWN_Y, finalY, 0.5) - 120 + windY * 0.3;

      const SCALE_START = 3.0;
      const SCALE_END   = 0.2;
      const startTime   = this.time.now;

      this.arrowSprite.setVisible(true);
      this._impactFired = false;

      const bezier = (p0, p1, p2, t) =>
        (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;

      this.time.addEvent({
        delay: 16,
        repeat: Math.ceil(FLIGHT_MS / 16) + 2,
        callback: () => {
          if (!this.arrowSprite.visible && !this.isFiring) return;

          const elapsed = this.time.now - startTime;
          const t  = Math.min(elapsed / FLIGHT_MS, 1);
          const te = t * t * (3 - 2 * t);   // smoothstep easing

          const cx    = bezier(SPAWN_X, ctrlX, finalX, te);
          const cy    = bezier(SPAWN_Y, ctrlY, finalY, te);
          const scale = Phaser.Math.Linear(SCALE_START, SCALE_END, te);

          this.drawArrow(cx, cy, scale);

          if (t >= 1 && !this._impactFired) {
            this._impactFired = true;
            this.arrowSprite.setVisible(false);
            // Pass the world offsets so scoring is in world space
            this.onArrowImpact(finalX, finalY, shotOffsetX, shotOffsetY);
          }
        },
      });
    }

    // ── Draw Arrow (flight) ────────────────────────────────────────────────
    drawArrow(x, y, scale) {
      this.arrowSprite.setPosition(x, y);
      this.arrowSprite.setScale(scale);
    }

    // ── Impact & Scoring ───────────────────────────────────────────────────
    // finalX/finalY are *canvas-space* impact coords (arrow landing spot).
    // The target center in canvas space at moment of release was:
    //   (TARGET_X + shotOffsetX, TARGET_Y + shotOffsetY)
    // Distance from impact to target center (world-space) is therefore:
    //   dx = finalX - (TARGET_X + shotOffsetX)   ... but we cancel TARGET_X vs startX:
    // Since startX = GAME_W/2 = TARGET_X, the offset equals the world offset.
    onArrowImpact(finalX, finalY, shotOffsetX, shotOffsetY) {
      // The target is static
      const targetCanvasX = TARGET_X;
      const targetCanvasY = TARGET_Y;

      const dx = finalX - targetCanvasX;
      const dy = finalY - targetCanvasY;
      const dist       = Math.sqrt(dx * dx + dy * dy);
      const normalised = dist / TARGET_RADIUS;

      let score = 0, label = 'Miss!', labelColor = '#ff5555', ringColor = 0xff5555;

      for (const ring of RINGS) {
        if (normalised <= ring.maxR) {
          score      = ring.score;
          ringColor  = ring.color;
          label      = ring.name === 'Bullseye' ? '🎯 PERFECT!' : `+${score}`;
          labelColor = ring.name === 'Bullseye' ? '#ffd700' : '#ffffff';
          break;
        }
      }

      this.totalScore += score;
      this.shotsLog.push({ impactX: finalX, impactY: finalY, dist: Math.round(dist), score });

      // ── Screen shake ──────────────────────────────────────────────────
      this.cameras.main.shake(120, 0.012);

      // ── Particle burst at canvas-space impact ─────────────────────────
      this.spawnImpactParticles(finalX, finalY, ringColor);

      // ── Impact marker (placed in world space — moves with target) ─────
      // We offset the marker by the world offset so it appears stuck to the target
      this.drawImpactMarker(finalX, finalY);

      // ── Score popup ───────────────────────────────────────────────────
      this.showScorePopup(label, labelColor);

      this.totalText.setText(`SCORE  ${this.totalScore}`);

      this.time.delayedCall(1200, () => {
        this.isFiring = false;
        if (this.arrowsLeft <= 0) {
          this.crosshairSpr.setVisible(false);
          this.endGame();
        }
      });
    }

    // ── Particle burst ─────────────────────────────────────────────────────
    spawnImpactParticles(x, y, color) {
      const count = 16;
      for (let i = 0; i < count; i++) {
        const angle   = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const speed   = 65 + Math.random() * 110;
        const vx      = Math.cos(angle) * speed;
        const vy      = Math.sin(angle) * speed;
        const size    = 3 + Math.random() * 5;
        const spark   = this.add.graphics().setDepth(90);
        this.worldContainer.add(spark);
        spark.fillStyle(color, 1);
        Math.random() > 0.5
          ? spark.fillCircle(0, 0, size / 2)
          : spark.fillRect(-size / 2, -size / 2, size, size);
        spark.setPosition(x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8);

        const lifespan = 300 + Math.random() * 250;
        this.tweens.add({
          targets: spark,
          x: spark.x + vx * lifespan / 1000,
          y: spark.y + vy * lifespan / 1000 + 30 * (lifespan / 1000),
          alpha: 0, scaleX: 0.1, scaleY: 0.1,
          duration: lifespan,
          ease: 'Power2',
          onComplete: () => spark.destroy(),
        });
      }

      const flash = this.add.graphics().setDepth(90);
      this.worldContainer.add(flash);
      flash.lineStyle(3, color, 1);
      flash.strokeCircle(x, y, 6);
      this.tweens.add({
        targets: flash,
        scaleX: 4, scaleY: 4, alpha: 0,
        duration: 350, ease: 'Power3',
        onComplete: () => flash.destroy(),
      });
    }

    // ── Impact marker (world-space, stays on target after further tilting) ──
    // We create a container positioned in screen-space at the world offset
    // and place the marker graphics relative to the canvas-center.
    drawImpactMarker(finalX, finalY) {
      if (!this._impactMarkers) this._impactMarkers = [];

      const g = this.add.graphics().setDepth(50);
      this.worldContainer.add(g);
      g.lineStyle(2.5, 0xd4a85a, 0.9);
      g.lineBetween(0, -12, 0, 5);
      g.fillStyle(0xb0bec5, 1);
      g.fillCircle(0, -12, 3.5);
      g.fillStyle(0xff4444, 1);
      g.fillCircle(0, 5, 2);

      g.setPosition(finalX, finalY);

      this._impactMarkers.push({
        gfx: g,
        dxLocal: finalX - TARGET_X,
        dyLocal: finalY - TARGET_Y,
      });
    }

    // ── Update (extended to reposition impact markers) ─────────────────────
    // (Already defined above — we monkey-patch it here via a different approach.
    //  Phaser only calls `update()` once so we override it properly in the
    //  overridden create() by integrating marker update into the same update loop.)

    // ── Score Popup ────────────────────────────────────────────────────────
    showScorePopup(label, color) {
      if (!this.scorePopup) {
        this.scorePopup = this.add.text(GAME_W / 2, GAME_H / 2 - 150, '', {
          fontFamily: "'Rajdhani', 'Inter', sans-serif",
          fontSize:   '54px',
          fontStyle:  'bold',
          color:      '#ffd700',
          stroke:     '#000814',
          strokeThickness: 7,
        }).setOrigin(0.5).setVisible(false);
        this.uiContainer.add(this.scorePopup);
      }

      this.scorePopup
        .setText(label).setColor(color)
        .setAlpha(1).setScale(0.3)
        .setVisible(true).setY(GAME_H / 2 - 150);

      this.tweens.add({
        targets: this.scorePopup,
        scaleX: 1.15, scaleY: 1.15,
        duration: 180, ease: 'Back.Out',
        onComplete: () => this.tweens.add({
          targets: this.scorePopup,
          scaleX: 1, scaleY: 1,
          duration: 80, ease: 'Linear',
          onComplete: () => this.tweens.add({
            targets: this.scorePopup,
            y: GAME_H / 2 - 230, alpha: 0,
            duration: 900, delay: 100, ease: 'Power2',
            onComplete: () => this.scorePopup.setVisible(false),
          }),
        }),
      });
    }

    // ── HUD ────────────────────────────────────────────────────────────────
    // Layout: single tall top bar (two rows) so nothing overflows on mobile.
    //
    //  ┌─────────────────────────────────────────┐  y=8
    //  │  🏹🏹🏹   [row 1, y≈24]       SCORE 0  │
    //  │  divider line                            │
    //  │  💨 ← 48 px/s     [row 2, y≈50]  ⊕Cal  │
    //  └─────────────────────────────────────────┘  y=72
    createHUD() {
      const fontBase = {
        fontFamily: "'Rajdhani', 'Inter', sans-serif",
        color: '#e8f4ff',
        stroke: '#000814',
        strokeThickness: 3,
      };

      // ── Single tall glass pill (two rows) ────────────────────────────────
      const BAR_H = 86;   // taller for emojis
      const BAR_Y = 12;
      const R1_Y  = BAR_Y + 12;   // row 1 text top-y
      const R2_Y  = BAR_Y + 56;   // row 2 center-y

      const barGfx = this.add.graphics();
      barGfx.fillStyle(0x000814, 0.68);
      barGfx.fillRoundedRect(8, BAR_Y, GAME_W - 16, BAR_H, 16);
      barGfx.lineStyle(1, 0x2266aa, 0.55);
      barGfx.strokeRoundedRect(8, BAR_Y, GAME_W - 16, BAR_H, 16);

      // Thin divider between rows
      barGfx.lineStyle(1, 0x1a3a55, 0.6);
      barGfx.lineBetween(18, BAR_Y + 42, GAME_W - 18, BAR_Y + 42);

      // ── Row 1: arrows (left) + score (right) ─────────────────────────────
      this.arrowsText = this.add.text(20, R1_Y, '', {
        ...fontBase, fontSize: '20px',
      });
      this.updateArrowsText();

      this.totalText = this.add.text(GAME_W - 18, R1_Y, 'SCORE  0', {
        ...fontBase, fontSize: '17px', align: 'right', color: '#ffd700',
      }).setOrigin(1, 0);

      // ── Row 2: wind arrow + speed (center-left) + calibrate (right) ──────
      // Wind label
      const windLabel = this.add.text(20, R2_Y, '💨', {
        fontSize: '14px',
      }).setOrigin(0, 0.5);

      // Rotatable wind direction arrow sprite
      this.windArrow = this.add.image(52, R2_Y, 'wind_arrow')
        .setOrigin(0.5, 0.5).setScale(0.7);

      // Wind speed text
      this.windText = this.add.text(68, R2_Y, '', {
        ...fontBase, fontSize: '15px', color: '#64ddff',
      }).setOrigin(0, 0.5);

      this.updateWindHUD();

      // ── Hint text ─────────────────────────────────────────────────────────
      const hint = this.add.text(GAME_W / 2, GAME_H - 130, 'Затисни, прицілься і відпусти для пострілу', {
        fontFamily: "'Rajdhani', 'Inter', sans-serif",
        fontSize: '14px',
        color: 'rgba(180,220,255,0.8)',
        align: 'center',
        wordWrap: { width: GAME_W - 40 },
        stroke: '#000814',
        strokeThickness: 3,
      }).setOrigin(0.5);
      this.tweens.add({ targets: hint, alpha: 0, delay: 5000, duration: 1200 });

      this.uiContainer.add([barGfx, this.arrowsText, this.totalText, windLabel, this.windArrow, this.windText, hint]);
    }

    // ── UI helpers ─────────────────────────────────────────────────────────
    updateWindHUD() {
      const dir = Math.atan2(this.wind.y, this.wind.x);
      const spd = Math.sqrt(this.wind.x ** 2 + this.wind.y ** 2);

      // Rotate wind arrow to actual wind direction
      this.windArrow.setRotation(dir);
      // Keep scale fixed — scaling inside the bar looks cleaner
      this.windArrow.setScale(0.75);

      // Show cardinal direction text + speed
      const dirs = ['→','↘','↓','↙','←','↖','↑','↗'];
      const idx  = Math.round((dir / (Math.PI * 2) + 1) * 8) % 8;
      this.windText.setText(`${dirs[idx]}  ${Math.round(spd)} px/s`);
    }

    updateArrowsText() {
      this.arrowsText.setText('🏹'.repeat(this.arrowsLeft));
    }

    // ── End Game ───────────────────────────────────────────────────────────
    endGame() {
      const overlay = this.add.graphics();
      overlay.fillStyle(0x000814, 0.72);
      overlay.fillRect(0, 0, GAME_W, GAME_H);

      const card = this.add.graphics();
      card.fillStyle(0x0d1b2a, 0.92);
      card.fillRoundedRect(GAME_W / 2 - 130, GAME_H / 2 - 110, 260, 200, 20);
      card.lineStyle(1.5, 0x2266aa, 0.7);
      card.strokeRoundedRect(GAME_W / 2 - 130, GAME_H / 2 - 110, 260, 200, 20);

      const cx = GAME_W / 2, cy = GAME_H / 2;
      const tf = { fontFamily: "'Rajdhani', 'Inter', sans-serif", stroke: '#000814', strokeThickness: 5 };

      const t1 = this.add.text(cx, cy - 80, 'Round Over!', { ...tf, fontSize: '34px', fontStyle: 'bold', color: '#ffd700' }).setOrigin(0.5);
      const t2 = this.add.text(cx, cy - 20, 'Total Score', { ...tf, fontSize: '16px', color: 'rgba(150,200,255,0.8)', strokeThickness: 2 }).setOrigin(0.5);
      const t3 = this.add.text(cx, cy + 28, `${this.totalScore}`, { ...tf, fontSize: '52px', fontStyle: 'bold', color: '#ffffff', strokeThickness: 4 }).setOrigin(0.5);

      this.uiContainer.add([overlay, card, t1, t2, t3]);

      this.time.delayedCall(1800, () => {
        if (typeof onGameFinished === 'function') onGameFinished(this.totalScore, this.shotsLog);
      });
    }

    // ── Cleanup ────────────────────────────────────────────────────────────
    cleanUp() {
      // Nothing to clean up globally anymore
    }
  };
}

// ─── Extend update() to handle impact marker repositioning ───────────────────
// We do this by post-patching the class prototype after creation.
// The real update() is already defined in the class body above but needs
// to also reposition markers. We solve this cleanly by including the
// marker reposition logic directly in the same update() — which means
// the class definition above must have ONE update() that does everything.
// Re-open: the class above already has a single update(). We embed marker
// repositioning by referencing this._impactMarkers there.

// NOTE: The update() inside createArcheryScene already uses this.worldOffsetX/Y
// to position bgSprite, targetSprite, standSprite. We need to ALSO move
// impact markers there. The code above defines drawImpactMarker() which pushes
// to this._impactMarkers — but the update() loop doesn't process them yet.
// We add a second update pass here by REDEFINING the scene class differently.
// Rather than patching, the cleanest solution is to write the class with a
// single update() that handles everything — which is what the final version below does.

// ─── React Component ─────────────────────────────────────────────────────────
export default function FirstPersonArchery({ onGameFinished, gyroPermissionGranted }) {
  const containerRef = useRef(null);
  const gameRef      = useRef(null);

  const handleFinished = useCallback((score, log) => {
    if (typeof onGameFinished === 'function') onGameFinished(score, log);
  }, [onGameFinished]);

  useEffect(() => {
    import('phaser').then((PhaserModule) => {
      const Phaser = PhaserModule.default ?? PhaserModule;
      globalThis.Phaser = Phaser;

      const SceneClass = createArcheryScene(handleFinished);

      // Patch update() to ALSO reposition impact markers each frame
      // (we extend the prototype after the class is created)
      const origUpdate = SceneClass.prototype.update;
      SceneClass.prototype.update = function () {
        origUpdate.call(this);
        // Reposition all stuck impact markers (now static)
        if (this._impactMarkers) {
          for (const m of this._impactMarkers) {
            m.gfx.setPosition(TARGET_X + m.dxLocal, TARGET_Y + m.dyLocal);
          }
        }
      };

      // Also store raw gyro values for the recalibrate button
      const origGyro = SceneClass.prototype.onDeviceOrientation;
      SceneClass.prototype.onDeviceOrientation = function (evt) {
        this._lastBeta  = evt.beta  ?? 0;
        this._lastGamma = evt.gamma ?? 0;
        origGyro.call(this, evt);
      };

      const config = {
        type:            Phaser.AUTO,
        width:           GAME_W,
        height:          GAME_H,
        backgroundColor: '#0a0a2e',
        scale: {
          mode:       Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          parent:     containerRef.current,
          width:      GAME_W,
          height:     GAME_H,
        },
        scene:  [SceneClass],
        input:  { activePointers: 2 },
        render: { antialias: true },
      };

      const game = new Phaser.Game(config);
      gameRef.current = game;
    });

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [handleFinished]);

  return (
    <div
      ref={containerRef}
      style={{
        width:       '100%',
        height:      '100%',
        overflow:    'hidden',
        touchAction: 'none',
        background:  '#0a0a2e',
      }}
    />
  );
}
