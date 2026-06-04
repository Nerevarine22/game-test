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
  // ── bg_gradient (oversized so panning never shows edge) ──────────────────
  // We make the bg 2× wide and 1.6× tall so the parallax shift never clips.
  {
    const w = GAME_W * 2, h = GAME_H * 1.6;
    const cvs = document.createElement('canvas');
    cvs.width = w; cvs.height = h;
    const ctx = cvs.getContext('2d');

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
    sky.addColorStop(0,   '#0a0a2e');
    sky.addColorStop(0.4, '#0d2157');
    sky.addColorStop(1,   '#1a4a7a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h * 0.55);

    // Stars
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 110; i++) {
      const sx = Math.random() * w;
      const sy = Math.random() * h * 0.5;
      const sr = Math.random() * 1.2 + 0.3;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Horizon glow
    const glow = ctx.createLinearGradient(0, h * 0.48, 0, h * 0.62);
    glow.addColorStop(0,   'rgba(100,220,255,0)');
    glow.addColorStop(0.5, 'rgba(100,220,255,0.15)');
    glow.addColorStop(1,   'rgba(100,220,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, h * 0.48, w, h * 0.14);

    // Ground
    const ground = ctx.createLinearGradient(0, h * 0.55, 0, h);
    ground.addColorStop(0,   '#1e5c2a');
    ground.addColorStop(0.3, '#174d20');
    ground.addColorStop(1,   '#0c2e12');
    ctx.fillStyle = ground;
    ctx.fillRect(0, h * 0.55, w, h * 0.45);

    // Lane lines
    const horizonY = h * 0.55;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const x = (w / 8) * i;
      ctx.beginPath();
      ctx.moveTo(w / 2, horizonY);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Horizon line
    ctx.strokeStyle = 'rgba(100,255,200,0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w, horizonY);
    ctx.stroke();

    scene.textures.addCanvas('bg_gradient', cvs);
  }

  // ── target ───────────────────────────────────────────────────────────────
  {
    const size = TARGET_RADIUS * 2 + 8;
    const cx = size / 2, cy = size / 2;
    const cvs = document.createElement('canvas');
    cvs.width = size; cvs.height = size;
    const ctx = cvs.getContext('2d');

    drawRing(ctx, cx, cy, TARGET_RADIUS,        null,      '#ffffff', '#aaaaaa', 1.5);
    drawRing(ctx, cx, cy, TARGET_RADIUS * 0.72, '#ffffff', '#2255ff', '#1133cc', 1.5);
    drawRing(ctx, cx, cy, TARGET_RADIUS * 0.45, '#2255ff', '#ff2222', '#cc0000', 1.5);
    drawRing(ctx, cx, cy, TARGET_RADIUS * 0.15, '#ff2222', '#ffd700', '#e6a200', 1.5);

    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - TARGET_RADIUS, cy); ctx.lineTo(cx + TARGET_RADIUS, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - TARGET_RADIUS); ctx.lineTo(cx, cy + TARGET_RADIUS); ctx.stroke();

    const bhl = ctx.createRadialGradient(cx - 4, cy - 4, 1, cx, cy, TARGET_RADIUS * 0.12);
    bhl.addColorStop(0, 'rgba(255,255,200,0.5)');
    bhl.addColorStop(1, 'rgba(255,210,0,0)');
    ctx.fillStyle = bhl;
    ctx.beginPath(); ctx.arc(cx, cy, TARGET_RADIUS * 0.15, 0, Math.PI * 2); ctx.fill();

    scene.textures.addCanvas('target', cvs);
  }

  // ── crosshair ────────────────────────────────────────────────────────────
  {
    const size = 110;
    const cx = size / 2, cy = size / 2;
    const cvs = document.createElement('canvas');
    cvs.width = size; cvs.height = size;
    const ctx = cvs.getContext('2d');

    const outerR = 30, gapLen = 9, tickLen = 20;

    // Outer ring glow
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur  = 10;
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth   = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.stroke();

    // Tick marks
    ctx.lineWidth = 2.5;
    [
      [cx, cy - gapLen,    cx, cy - gapLen - tickLen],
      [cx, cy + gapLen,    cx, cy + gapLen + tickLen],
      [cx - gapLen, cy,    cx - gapLen - tickLen, cy],
      [cx + gapLen, cy,    cx + gapLen + tickLen, cy],
    ].forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });

    // Center dot
    ctx.shadowColor = '#ff0055';
    ctx.shadowBlur  = 8;
    ctx.fillStyle   = '#ff0055';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    scene.textures.addCanvas('crosshair', cvs);
  }

  // ── target stand (separate from bg so it moves with the target) ──────────
  {
    const w = 14, h = 120;
    const cvs = document.createElement('canvas');
    cvs.width = w; cvs.height = h;
    const ctx = cvs.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0,   '#2a1a0a');
    grad.addColorStop(0.5, '#5a3e1e');
    grad.addColorStop(1,   '#2a1a0a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    scene.textures.addCanvas('target_stand', cvs);
  }

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
}

function drawRing(ctx, cx, cy, r, _inner, fillColor, strokeColor, lw) {
  ctx.fillStyle = fillColor;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  if (strokeColor) { ctx.strokeStyle = strokeColor; ctx.lineWidth = lw; ctx.stroke(); }
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

    // World-pan state (gyro drives these)
    worldOffsetX   = 0;   // current interpolated world shift (px)
    worldOffsetY   = 0;
    targetOffsetX  = 0;   // desired world shift from gyro
    targetOffsetY  = 0;

    // Gyro calibration baseline
    betaOffset  = null;   // null until first event received
    gammaOffset = null;

    // Bound event handler (kept so we can remove it in shutdown)
    _gyroHandler = null;

    // Phaser game objects
    bgSprite     = null;
    standSprite  = null;
    targetSprite = null;
    crosshairSpr = null;
    arrowGfx     = null;
    windText     = null;
    windArrow    = null;
    arrowsText   = null;
    scorePopup   = null;
    totalText    = null;
    gyroHint     = null;   // "Tap to shoot" / calibrate label
    calibBtn     = null;   // in-game calibrate button text

    // ── Preload ────────────────────────────────────────────────────────────
    preload() { /* All textures are generated programmatically in create() */ }

    // ── Create ─────────────────────────────────────────────────────────────
    create() {
      this.wind = randomWind();

      generateTextures(this);

      // ── Background (oversized; panning anchor = center of canvas) ────────
      // The bg is 2×GAME_W wide; we position its center over the canvas center
      // so there is equal overhang on each side for panning.
      this.bgSprite = this.add.image(GAME_W / 2, GAME_H / 2, 'bg_gradient')
        .setOrigin(0.5, 0.5);

      // ── Target stand (child of world so it pans with target) ──────────────
      this.standSprite = this.add.image(
        TARGET_X,
        TARGET_Y + TARGET_RADIUS,
        'target_stand'
      ).setOrigin(0.5, 0);

      // ── Target ───────────────────────────────────────────────────────────
      this.targetSprite = this.add.image(TARGET_X, TARGET_Y, 'target')
        .setOrigin(0.5, 0.5);

      // ── Arrow graphics (flight animation) ────────────────────────────────
      this.arrowGfx = this.add.graphics();
      this.arrowGfx.setVisible(false);

      // ── Crosshair — FIXED at dead center, always on top ──────────────────
      this.crosshairSpr = this.add.image(GAME_W / 2, GAME_H / 2, 'crosshair')
        .setOrigin(0.5, 0.5)
        .setDepth(100);          // always above world objects

      // ── HUD ──────────────────────────────────────────────────────────────
      this.createHUD();

      // ── Gyroscope listener ───────────────────────────────────────────────
      this._gyroHandler = this.onDeviceOrientation.bind(this);
      window.addEventListener('deviceorientation', this._gyroHandler, true);

      // ── Input: single tap fires ───────────────────────────────────────────
      this.input.on('pointerdown', this.onPointerDown, this);

      // ── Scene shutdown cleanup ────────────────────────────────────────────
      this.events.once('shutdown', this.cleanUp, this);
      this.events.once('destroy',  this.cleanUp, this);
    }

    // ── Calibration ────────────────────────────────────────────────────────
    // Store the current raw angles as the "zero" reference.
    calibrateGyro(beta, gamma) {
      this.betaOffset  = beta;
      this.gammaOffset = gamma;
      // Snap world immediately to center so there's no jump
      this.targetOffsetX = 0;
      this.targetOffsetY = 0;
    }

    // ── DeviceOrientation handler ──────────────────────────────────────────
    onDeviceOrientation(evt) {
      const beta  = evt.beta  ?? 0;   // front/back tilt  → Y axis
      const gamma = evt.gamma ?? 0;   // left/right tilt  → X axis

      // Auto-calibrate on first event
      if (this.betaOffset === null) {
        this.calibrateGyro(beta, gamma);
        return;
      }

      const dBeta  = beta  - this.betaOffset;   // positive = phone tilted forward
      const dGamma = gamma - this.gammaOffset;  // positive = phone tilted right

      // Tilting right  → gamma increases → world moves RIGHT (target appears to go right)
      // Tilting forward→ beta  increases → world moves DOWN  (target appears to go down)
      // We invert so it feels like looking left/right/up/down:
      //   tilt right  → world shifts RIGHT (target drifts to the right of crosshair)
      //   tilt forward→ world shifts DOWN  (target drifts down)
      const rawX =  dGamma * PX_PER_DEGREE;
      const rawY =  dBeta  * PX_PER_DEGREE;

      this.targetOffsetX = Phaser.Math.Clamp(rawX, -MAX_OFFSET_X, MAX_OFFSET_X);
      this.targetOffsetY = Phaser.Math.Clamp(rawY, -MAX_OFFSET_Y, MAX_OFFSET_Y);
    }

    // ── Update (called every frame) ────────────────────────────────────────
    update() {
      // Smooth-lerp world offset toward gyro target
      this.worldOffsetX = Phaser.Math.Linear(this.worldOffsetX, this.targetOffsetX, LERP_FACTOR);
      this.worldOffsetY = Phaser.Math.Linear(this.worldOffsetY, this.targetOffsetY, LERP_FACTOR);

      const ox = this.worldOffsetX;
      const oy = this.worldOffsetY;

      // Move world objects; bg moves at 0.4× for a parallax feel
      this.bgSprite.setPosition(GAME_W / 2 + ox * 0.4, GAME_H / 2 + oy * 0.4);
      this.targetSprite.setPosition(TARGET_X + ox, TARGET_Y + oy);
      this.standSprite.setPosition(TARGET_X + ox, TARGET_Y + TARGET_RADIUS + oy);

      // Crosshair stays exactly at center
      this.crosshairSpr.setPosition(GAME_W / 2, GAME_H / 2);

      // Breathing pulse on crosshair
      const alpha = 0.80 + Math.sin(this.time.now / 420) * 0.18;
      this.crosshairSpr.setAlpha(this.isFiring ? 0 : alpha);
    }

    // ── Tap input → fire ───────────────────────────────────────────────────
    onPointerDown() {
      if (this.isFiring || this.arrowsLeft <= 0) return;
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

      // Crosshair canvas position (always screen center)
      const startX = GAME_W / 2;
      const startY = GAME_H / 2;

      // Arrow spawns at bottom-center coming toward the player
      const SPAWN_X = GAME_W / 2;
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

      this.arrowGfx.setVisible(true);
      this._impactFired = false;

      const bezier = (p0, p1, p2, t) =>
        (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;

      this.time.addEvent({
        delay: 16,
        repeat: Math.ceil(FLIGHT_MS / 16) + 2,
        callback: () => {
          if (!this.arrowGfx.visible && !this.isFiring) return;

          const elapsed = this.time.now - startTime;
          const t  = Math.min(elapsed / FLIGHT_MS, 1);
          const te = t * t * (3 - 2 * t);   // smoothstep easing

          const cx    = bezier(SPAWN_X, ctrlX, finalX, te);
          const cy    = bezier(SPAWN_Y, ctrlY, finalY, te);
          const scale = Phaser.Math.Linear(SCALE_START, SCALE_END, te);

          this.drawArrow(cx, cy, scale);

          if (t >= 1 && !this._impactFired) {
            this._impactFired = true;
            this.arrowGfx.setVisible(false);
            // Pass the world offsets so scoring is in world space
            this.onArrowImpact(finalX, finalY, shotOffsetX, shotOffsetY);
          }
        },
      });
    }

    // ── Draw Arrow (flight) ────────────────────────────────────────────────
    drawArrow(x, y, scale) {
      const g = this.arrowGfx;
      g.clear();

      const shaft = 40 * scale;
      const headW = 8  * scale;
      const headH = 12 * scale;

      g.lineStyle(Math.max(1, 3 * scale), 0xd4a85a, 1);
      g.lineBetween(x, y + headH, x, y + headH + shaft);

      g.fillStyle(0xb0bec5, 1);
      g.fillTriangle(x, y, x - headW, y + headH, x + headW, y + headH);

      g.fillStyle(0xe8f4ff, 0.3);
      g.fillTriangle(x, y + 2, x - headW * 0.5, y + headH, x + headW * 0.5, y + headH);

      g.lineStyle(Math.max(1, 2 * scale), 0xff4444, 1);
      g.lineBetween(x - headW * 0.5, y + headH + shaft, x + headW * 0.5, y + headH + shaft);
    }

    // ── Impact & Scoring ───────────────────────────────────────────────────
    // finalX/finalY are *canvas-space* impact coords (arrow landing spot).
    // The target center in canvas space at moment of release was:
    //   (TARGET_X + shotOffsetX, TARGET_Y + shotOffsetY)
    // Distance from impact to target center (world-space) is therefore:
    //   dx = finalX - (TARGET_X + shotOffsetX)   ... but we cancel TARGET_X vs startX:
    // Since startX = GAME_W/2 = TARGET_X, the offset equals the world offset.
    onArrowImpact(finalX, finalY, shotOffsetX, shotOffsetY) {
      // Canvas-space target center at time of shot
      const targetCanvasX = TARGET_X + shotOffsetX;
      const targetCanvasY = TARGET_Y + shotOffsetY;

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
      this.drawImpactMarker(
        finalX - shotOffsetX,   // local coords relative to target group
        finalY - shotOffsetY,
        shotOffsetX,
        shotOffsetY
      );

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
    drawImpactMarker(localX, localY, shotOffsetX, shotOffsetY) {
      // The "local" coords are relative to the center-of-canvas.
      // We add a graphics object and position it in world coords.
      // During update(), we would need to reposition it — simpler: use
      // a Phaser Container that we reposition each frame.
      // For simplicity: store markers in an array, reposition in update().
      if (!this._impactMarkers) this._impactMarkers = [];

      const g = this.add.graphics().setDepth(50);
      // Draw relative to its own (0,0)
      g.lineStyle(2.5, 0xd4a85a, 0.9);
      g.lineBetween(0, -12, 0, 5);
      g.fillStyle(0xb0bec5, 1);
      g.fillCircle(0, -12, 3.5);
      g.fillStyle(0xff4444, 1);
      g.fillCircle(0, 5, 2);

      // localX/localY are in target-relative space (i.e. offset from TARGET_X,TARGET_Y)
      // We need to reconstruct: markerWorldX = TARGET_X + (finalX - targetCanvasX)
      //                                      = TARGET_X + dx
      // where dx = finalX - (TARGET_X + shotOffsetX)
      // Equivalent: localX = finalX - shotOffsetX  (we passed that in)
      g.setPosition(localX + shotOffsetX, localY + shotOffsetY);

      // Save so update() can reposition as world pans
      // The marker's *world-relative* anchor is (localX - TARGET_X, localY - TARGET_Y)
      // relative to the target. In update, its canvas pos = TARGET_X + dxLocal + worldOffsetX
      this._impactMarkers.push({
        gfx: g,
        dxLocal: localX - TARGET_X,   // offset from target origin in world space
        dyLocal: localY - TARGET_Y,
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
        }).setOrigin(0.5).setDepth(200).setVisible(false);
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
      const BAR_H = 76;   // tall enough for two rows
      const BAR_Y = 8;
      const R1_Y  = BAR_Y + 16;   // row 1 text top-y
      const R2_Y  = BAR_Y + 46;   // row 2 center-y

      const barGfx = this.add.graphics().setDepth(150);
      barGfx.fillStyle(0x000814, 0.68);
      barGfx.fillRoundedRect(8, BAR_Y, GAME_W - 16, BAR_H, 16);
      barGfx.lineStyle(1, 0x2266aa, 0.55);
      barGfx.strokeRoundedRect(8, BAR_Y, GAME_W - 16, BAR_H, 16);

      // Thin divider between rows
      barGfx.lineStyle(1, 0x1a3a55, 0.6);
      barGfx.lineBetween(18, BAR_Y + 36, GAME_W - 18, BAR_Y + 36);

      // ── Row 1: arrows (left) + score (right) ─────────────────────────────
      this.arrowsText = this.add.text(20, R1_Y, '', {
        ...fontBase, fontSize: '20px',
      }).setDepth(151);
      this.updateArrowsText();

      this.totalText = this.add.text(GAME_W - 18, R1_Y, 'SCORE  0', {
        ...fontBase, fontSize: '17px', align: 'right', color: '#ffd700',
      }).setOrigin(1, 0).setDepth(151);

      // ── Row 2: wind arrow + speed (center-left) + calibrate (right) ──────
      // Wind label
      const windLabel = this.add.text(20, R2_Y, '💨', {
        fontSize: '14px',
      }).setOrigin(0, 0.5).setDepth(151);

      // Rotatable wind direction arrow sprite
      this.windArrow = this.add.image(52, R2_Y, 'wind_arrow')
        .setOrigin(0.5, 0.5).setScale(0.7).setDepth(151);

      // Wind speed text
      this.windText = this.add.text(68, R2_Y, '', {
        ...fontBase, fontSize: '15px', color: '#64ddff',
      }).setOrigin(0, 0.5).setDepth(151);

      this.updateWindHUD();

      // Calibrate button — right side of row 2
      this.calibBtn = this.add.text(GAME_W - 18, R2_Y, '⊕ Cal', {
        fontFamily: "'Rajdhani', 'Inter', sans-serif",
        fontSize: '14px',
        color: '#64ddff',
        stroke: '#000814',
        strokeThickness: 2,
      }).setOrigin(1, 0.5).setDepth(151).setInteractive({ useHandCursor: true });

      this.calibBtn.on('pointerdown', (ptr) => {
        ptr.event.stopPropagation();
        if (this._lastBeta !== undefined) {
          this.calibrateGyro(this._lastBeta, this._lastGamma);
          // Brief flash feedback
          this.tweens.add({
            targets: this.calibBtn,
            alpha: 0.2,
            duration: 80,
            yoyo: true,
            repeat: 1,
          });
        }
      });

      // ── Hint text — raised well above home indicator ──────────────────────
      const hint = this.add.text(GAME_W / 2, GAME_H - 130, 'Нахили телефон для прицілу  •  Тап — постріл', {
        fontFamily: "'Rajdhani', 'Inter', sans-serif",
        fontSize: '13px',
        color: 'rgba(180,220,255,0.7)',
        align: 'center',
        wordWrap: { width: GAME_W - 40 },
      }).setOrigin(0.5).setDepth(151);
      this.tweens.add({ targets: hint, alpha: 0, delay: 4000, duration: 1200 });
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
      const overlay = this.add.graphics().setDepth(180);
      overlay.fillStyle(0x000814, 0.72);
      overlay.fillRect(0, 0, GAME_W, GAME_H);

      const card = this.add.graphics().setDepth(181);
      card.fillStyle(0x0d1b2a, 0.92);
      card.fillRoundedRect(GAME_W / 2 - 130, GAME_H / 2 - 110, 260, 200, 20);
      card.lineStyle(1.5, 0x2266aa, 0.7);
      card.strokeRoundedRect(GAME_W / 2 - 130, GAME_H / 2 - 110, 260, 200, 20);

      const cx = GAME_W / 2, cy = GAME_H / 2;
      const tf = { fontFamily: "'Rajdhani', 'Inter', sans-serif", stroke: '#000814', strokeThickness: 5 };

      this.add.text(cx, cy - 80, 'Round Over!', { ...tf, fontSize: '34px', fontStyle: 'bold', color: '#ffd700' }).setOrigin(0.5).setDepth(182);
      this.add.text(cx, cy - 20, 'Total Score', { ...tf, fontSize: '16px', color: 'rgba(150,200,255,0.8)', strokeThickness: 2 }).setOrigin(0.5).setDepth(182);
      this.add.text(cx, cy + 28, `${this.totalScore}`, { ...tf, fontSize: '52px', fontStyle: 'bold', color: '#ffffff', strokeThickness: 4 }).setOrigin(0.5).setDepth(182);

      this.time.delayedCall(1800, () => {
        if (typeof onGameFinished === 'function') onGameFinished(this.totalScore, this.shotsLog);
      });
    }

    // ── Cleanup (remove global event listeners) ────────────────────────────
    cleanUp() {
      if (this._gyroHandler) {
        window.removeEventListener('deviceorientation', this._gyroHandler, true);
        this._gyroHandler = null;
      }
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
        // Reposition all stuck impact markers so they follow the target
        if (this._impactMarkers) {
          const ox = this.worldOffsetX;
          const oy = this.worldOffsetY;
          for (const m of this._impactMarkers) {
            m.gfx.setPosition(TARGET_X + m.dxLocal + ox, TARGET_Y + m.dyLocal + oy);
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
          mode:       Phaser.Scale.ENVELOP,
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
