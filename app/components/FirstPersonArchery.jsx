'use client';

import { useEffect, useRef, useCallback } from 'react';

// ─── Constants ───────────────────────────────────────────────────────────────
const GAME_W = 390;
const GAME_H = 844;
const TOTAL_ARROWS = 3;

const TARGET_X = GAME_W / 2;
const TARGET_Y = GAME_H / 2 - 40;
const TARGET_RADIUS = 90; // outer ring radius at scale 1

// Score ring radii (% of TARGET_RADIUS)
const RINGS = [
  { name: 'Bullseye', maxR: 0.15, score: 10 },
  { name: 'Inner',    maxR: 0.45, score: 7  },
  { name: 'Middle',   maxR: 0.72, score: 5  },
  { name: 'Outer',    maxR: 1.00, score: 3  },
];

// ─── Wind helper ─────────────────────────────────────────────────────────────
function randomWind() {
  const angle = Math.random() * Math.PI * 2;
  const speed = 30 + Math.random() * 70; // px/s drift
  return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
}

// ─── Main Scene ──────────────────────────────────────────────────────────────
function createArcheryScene(onGameFinished) {
  return class ArcheryScene extends globalThis.Phaser.Scene {
    constructor() {
      super({ key: 'ArcheryScene' });
    }

    // ── State ──────────────────────────────────────────────────────────────
    wind       = { x: 0, y: 0 };
    crossX     = GAME_W / 2;
    crossY     = GAME_H / 2;
    arrowsLeft = TOTAL_ARROWS;
    totalScore = 0;
    shotsLog   = [];
    isHolding  = false;
    isFiring   = false;
    pointerStartX  = 0;
    pointerStartY  = 0;
    crossStartX    = 0;
    crossStartY    = 0;

    // Phaser game objects
    bgGfx        = null;
    targetGfx    = null;
    crosshairGfx = null;
    arrowGfx     = null;
    windText     = null;
    arrowsText   = null;
    scorePopup   = null;
    totalText    = null;

    // ── Create ─────────────────────────────────────────────────────────────
    create() {
      this.wind = randomWind();

      // Background
      this.bgGfx = this.add.graphics();
      this.drawBackground();

      // Target
      this.targetGfx = this.add.graphics();
      this.drawTarget();

      // Arrow graphics (hidden initially)
      this.arrowGfx = this.add.graphics();
      this.arrowGfx.setVisible(false);

      // Crosshair
      this.crosshairGfx = this.add.graphics();
      this.drawCrosshair(this.crossX, this.crossY);

      // ── UI ──────────────────────────────────────────────────────────────
      const uiStyle = {
        fontFamily: "'Outfit', sans-serif",
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      };

      this.windText = this.add.text(GAME_W / 2, 24, '', {
        ...uiStyle, fontSize: '16px', align: 'center'
      }).setOrigin(0.5, 0);
      this.updateWindText();

      this.arrowsText = this.add.text(20, 24, '', uiStyle);
      this.updateArrowsText();

      this.totalText = this.add.text(GAME_W - 20, 24, 'Score: 0', {
        ...uiStyle, align: 'right'
      }).setOrigin(1, 0);

      // Score popup (hidden)
      this.scorePopup = this.add.text(GAME_W / 2, GAME_H / 2 - 160, '', {
        ...uiStyle,
        fontSize: '48px',
        fontStyle: 'bold',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 6,
      }).setOrigin(0.5).setVisible(false);

      // Hint text
      const hint = this.add.text(GAME_W / 2, GAME_H - 60, 'Hold & drag to aim • Release to shoot', {
        fontFamily: "'Outfit', sans-serif",
        fontSize: '14px',
        color: 'rgba(255,255,255,0.6)',
        align: 'center',
      }).setOrigin(0.5);
      // Fade hint after 3s
      this.tweens.add({ targets: hint, alpha: 0, delay: 3000, duration: 1000 });

      // ── Input ────────────────────────────────────────────────────────────
      this.input.on('pointerdown', this.onPointerDown, this);
      this.input.on('pointermove', this.onPointerMove, this);
      this.input.on('pointerup',   this.onPointerUp,   this);
    }

    // ── Update ─────────────────────────────────────────────────────────────
    // Crosshair is 100% pointer-driven — NO wind drift here.
    // Wind only affects the arrow during flight (see fireArrow).
    update() {
      if (this.isFiring) return;
      this.drawCrosshair(this.crossX, this.crossY);
    }

    // ── Draw Background ────────────────────────────────────────────────────
    drawBackground() {
      const g = this.bgGfx;
      g.clear();

      // Sky gradient approximation via rectangles
      for (let i = 0; i < GAME_H * 0.55; i++) {
        const t = i / (GAME_H * 0.55);
        const r = Phaser.Math.Linear(20,  80, t);
        const gr = Phaser.Math.Linear(20,  60, t);
        const b = Phaser.Math.Linear(50, 120, t);
        g.fillStyle(Phaser.Display.Color.GetColor(Math.round(r), Math.round(gr), Math.round(b)));
        g.fillRect(0, i, GAME_W, 1);
      }

      // Ground
      for (let i = 0; i < GAME_H * 0.45; i++) {
        const t = i / (GAME_H * 0.45);
        const r = Phaser.Math.Linear(34, 20, t);
        const gr = Phaser.Math.Linear(85, 50, t);
        const b = Phaser.Math.Linear(34, 20, t);
        g.fillStyle(Phaser.Display.Color.GetColor(Math.round(r), Math.round(gr), Math.round(b)));
        g.fillRect(0, Math.round(GAME_H * 0.55) + i, GAME_W, 1);
      }

      // Horizon line glow
      g.lineStyle(2, 0x88ffcc, 0.3);
      g.strokeRect(0, Math.round(GAME_H * 0.55), GAME_W, 0);

      // Lane lines (depth illusion)
      g.lineStyle(1, 0xffffff, 0.08);
      const horizonY = GAME_H * 0.55;
      for (let i = 0; i <= 6; i++) {
        const x = (GAME_W / 6) * i;
        g.lineBetween(GAME_W / 2, horizonY, x, GAME_H);
      }

      // Target post/stand
      g.fillStyle(0x5a3e28);
      g.fillRect(TARGET_X - 6, TARGET_Y + TARGET_RADIUS, 12, 120);
    }

    // ── Draw Target ────────────────────────────────────────────────────────
    drawTarget() {
      const g = this.targetGfx;
      g.clear();
      g.setPosition(TARGET_X, TARGET_Y);

      const rings = [
        { r: TARGET_RADIUS,        color: 0xffffff, stroke: 0x888888 },
        { r: TARGET_RADIUS * 0.72, color: 0x1a1aff, stroke: 0x0000cc },
        { r: TARGET_RADIUS * 0.45, color: 0xff2222, stroke: 0xcc0000 },
        { r: TARGET_RADIUS * 0.15, color: 0xffd700, stroke: 0xffaa00 },
      ];

      rings.forEach(ring => {
        g.fillStyle(ring.color, 1);
        g.fillCircle(0, 0, ring.r);
        g.lineStyle(1.5, ring.stroke, 1);
        g.strokeCircle(0, 0, ring.r);
      });

      // Cross hair lines on target
      g.lineStyle(1, 0x000000, 0.25);
      g.lineBetween(-TARGET_RADIUS, 0, TARGET_RADIUS, 0);
      g.lineBetween(0, -TARGET_RADIUS, 0, TARGET_RADIUS);
    }

    // ── Draw Crosshair ─────────────────────────────────────────────────────
    drawCrosshair(x, y) {
      const g = this.crosshairGfx;
      g.clear();

      const size  = 30;
      const gap   = 8;
      const alpha = this.isHolding ? 1 : 0.7;

      g.lineStyle(2, 0x00ffcc, alpha);
      g.strokeCircle(x, y, size * 0.5);

      // Four tick marks
      g.lineBetween(x,          y - gap,        x,          y - size);
      g.lineBetween(x,          y + gap,        x,          y + size);
      g.lineBetween(x - gap,    y,              x - size,   y);
      g.lineBetween(x + gap,    y,              x + size,   y);

      // Center dot
      g.fillStyle(0xff0055, 1);
      g.fillCircle(x, y, 3);
    }

    // ── Input handlers ─────────────────────────────────────────────────────
    // Crosshair tracks pointer delta with perfect 1:1 precision.
    onPointerDown(ptr) {
      if (this.isFiring || this.arrowsLeft <= 0) return;
      this.isHolding     = true;
      this.pointerStartX = ptr.x;
      this.pointerStartY = ptr.y;
      this.crossStartX   = this.crossX;
      this.crossStartY   = this.crossY;
    }

    onPointerMove(ptr) {
      if (!this.isHolding || this.isFiring) return;
      // Pure 1:1 drag — no wind, no smoothing, no offset
      this.crossX = Phaser.Math.Clamp(
        this.crossStartX + (ptr.x - this.pointerStartX), 20, GAME_W - 20
      );
      this.crossY = Phaser.Math.Clamp(
        this.crossStartY + (ptr.y - this.pointerStartY), 80, GAME_H - 80
      );
    }

    onPointerUp() {
      if (!this.isHolding || this.isFiring) return;
      this.isHolding = false;
      this.fireArrow();
    }

    // ── Fire Arrow ─────────────────────────────────────────────────────────
    // Arrow flight uses a quadratic bezier to curve from the bottom of the
    // screen toward the crosshair aim point, then drift to finalX/Y driven
    // by windX, windY and gravityDrop. The crosshair is NOT moved at all.
    fireArrow() {
      if (this.arrowsLeft <= 0) return;
      this.arrowsLeft--;
      this.isFiring = true;
      this.updateArrowsText();

      // ── 1. Capture exact crosshair position at release ──────────────────
      const startX = this.crossX;  // aim point X
      const startY = this.crossY;  // aim point Y

      // ── 2. Arrow spawns at bottom-center at large scale ─────────────────
      const SPAWN_X = GAME_W / 2;
      const SPAWN_Y = GAME_H + 30;

      // ── 3. Wind & gravity accumulated over 1-second flight ──────────────
      const FLIGHT_MS   = 1000;
      const FLIGHT_S    = FLIGHT_MS / 1000;       // 1.0 s
      const GRAVITY_DROP = 40;                    // px downward during flight
      const windX = this.wind.x * FLIGHT_S;       // total X drift
      const windY = this.wind.y * FLIGHT_S;       // total Y drift

      // Final impact coordinates (formula from spec)
      const finalX = startX + windX;
      const finalY = startY + windY + GRAVITY_DROP;

      // ── 4. Bezier control point — pulled in wind direction at mid-height ─
      // The control point sits at 50% flight distance horizontally drifted
      // by the wind, giving a natural curve. Vertically it's pulled upward
      // (bow arc) then drops due to gravity/wind.
      const ctrlX = Phaser.Math.Linear(SPAWN_X, finalX, 0.5) + windX * 0.5;
      const ctrlY = Phaser.Math.Linear(SPAWN_Y, finalY, 0.5) - 120 + windY * 0.3;

      // ── 5. Animate every frame ───────────────────────────────────────────
      const SCALE_START = 3.0;
      const SCALE_END   = 0.2;
      const startTime   = this.time.now;

      this.arrowGfx.setVisible(true);

      // Quadratic bezier helper: B(t) = (1-t)²·P0 + 2(1-t)t·P1 + t²·P2
      const bezier = (p0, p1, p2, t) =>
        (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;

      this.time.addEvent({
        delay: 16,
        repeat: Math.ceil(FLIGHT_MS / 16) + 2,
        callback: () => {
          // Guard: once impact fires, ignore remaining repeats
          if (!this.arrowGfx.visible && this.isFiring === false) return;

          const elapsed = this.time.now - startTime;
          const t = Math.min(elapsed / FLIGHT_MS, 1);

          // Smooth easing on t so the arrow accelerates slightly
          const te = t * t * (3 - 2 * t); // smoothstep

          // Bezier position: SPAWN → ctrl → final
          const cx    = bezier(SPAWN_X, ctrlX, finalX, te);
          const cy    = bezier(SPAWN_Y, ctrlY, finalY, te);
          const scale = Phaser.Math.Linear(SCALE_START, SCALE_END, te);

          this.drawArrow(cx, cy, scale);

          if (t >= 1 && !this._impactFired) {
            this._impactFired = true;          // fire exactly once
            this.arrowGfx.setVisible(false);
            this.onArrowImpact(finalX, finalY);
          }
        },
      });
      this._impactFired = false; // reset flag for this shot
    }

    // ── Draw Arrow (scale-based depth illusion) ────────────────────────────
    drawArrow(x, y, scale) {
      const g = this.arrowGfx;
      g.clear();

      const shaft = 40 * scale;
      const headW = 8  * scale;
      const headH = 12 * scale;

      // Shaft
      g.lineStyle(Math.max(1, 3 * scale), 0xd4a85a, 1);
      g.lineBetween(x, y + headH, x, y + headH + shaft);

      // Arrowhead
      g.fillStyle(0x888888, 1);
      g.fillTriangle(x, y, x - headW, y + headH, x + headW, y + headH);

      // Nock
      g.lineStyle(Math.max(1, 2 * scale), 0xff4444, 1);
      g.lineBetween(x - headW * 0.5, y + headH + shaft, x + headW * 0.5, y + headH + shaft);
    }

    // ── Impact & Scoring ───────────────────────────────────────────────────
    // finalX and finalY already include windX, windY, gravityDrop from fireArrow.
    onArrowImpact(finalX, finalY) {
      const impactX = finalX;
      const impactY = finalY;

      // Distance from target center
      const dx = impactX - TARGET_X;
      const dy = impactY - TARGET_Y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const normalised = dist / TARGET_RADIUS;

      // Score
      let score = 0;
      let label = 'Miss!';
      let labelColor = '#ff4444';

      for (const ring of RINGS) {
        if (normalised <= ring.maxR) {
          score = ring.score;
          label = ring.name === 'Bullseye' ? '🎯 10!' : `+${score}`;
          labelColor = ring.name === 'Bullseye' ? '#ffd700' : '#ffffff';
          break;
        }
      }

      this.totalScore += score;
      this.shotsLog.push({ impactX, impactY, dist: Math.round(dist), score });

      // Draw impact marker on target
      this.drawImpactMarker(impactX, impactY);

      // Score popup
      this.showScorePopup(label, labelColor);

      this.totalText.setText(`Score: ${this.totalScore}`);

      // After short delay, either reset for next arrow or finish game
      this.time.delayedCall(1200, () => {
        this.isFiring = false;
        if (this.arrowsLeft <= 0) {
          this.endGame();
        }
      });
    }

    // ── Impact Marker (embedded arrow) ─────────────────────────────────────
    drawImpactMarker(x, y) {
      const g = this.add.graphics();
      g.lineStyle(2, 0xd4a85a, 1);
      g.lineBetween(x, y - 10, x, y + 4);
      g.fillStyle(0x888888, 1);
      g.fillCircle(x, y - 10, 3);
      g.fillStyle(0xff4444, 1);
      g.fillCircle(x, y + 4, 2);
    }

    // ── Score popup ────────────────────────────────────────────────────────
    showScorePopup(label, color) {
      this.scorePopup.setText(label).setColor(color).setAlpha(1).setVisible(true);
      this.scorePopup.setY(GAME_H / 2 - 160);
      this.tweens.add({
        targets: this.scorePopup,
        y: GAME_H / 2 - 220,
        alpha: 0,
        duration: 1000,
        ease: 'Power2',
        onComplete: () => this.scorePopup.setVisible(false),
      });
    }

    // ── UI helpers ─────────────────────────────────────────────────────────
    updateWindText() {
      const dir  = Math.atan2(this.wind.y, this.wind.x);
      const spd  = Math.sqrt(this.wind.x ** 2 + this.wind.y ** 2);
      const dirs = ['→','↘','↓','↙','←','↖','↑','↗'];
      const arrow = dirs[Math.round(((dir + Math.PI) / (Math.PI * 2)) * 8) % 8];
      this.windText.setText(`💨 Wind ${arrow}  ${Math.round(spd)} px/s`);
    }

    updateArrowsText() {
      this.arrowsText.setText('🏹 '.repeat(this.arrowsLeft));
    }

    // ── End Game ───────────────────────────────────────────────────────────
    endGame() {
      // Darken overlay
      const overlay = this.add.graphics();
      overlay.fillStyle(0x000000, 0.65);
      overlay.fillRect(0, 0, GAME_W, GAME_H);

      const cx = GAME_W / 2;
      const cy = GAME_H / 2;

      this.add.text(cx, cy - 80, 'Round Over!', {
        fontFamily: "'Outfit', sans-serif",
        fontSize: '36px',
        fontStyle: 'bold',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 6,
      }).setOrigin(0.5);

      this.add.text(cx, cy, `Total Score: ${this.totalScore}`, {
        fontFamily: "'Outfit', sans-serif",
        fontSize: '28px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      }).setOrigin(0.5);

      // Callback to Next.js
      this.time.delayedCall(1800, () => {
        if (typeof onGameFinished === 'function') {
          onGameFinished(this.totalScore, this.shotsLog);
        }
      });
    }
  };
}

// ─── React Component ─────────────────────────────────────────────────────────
export default function FirstPersonArchery({ onGameFinished }) {
  const containerRef = useRef(null);
  const gameRef      = useRef(null);

  const handleFinished = useCallback((score, log) => {
    if (typeof onGameFinished === 'function') {
      onGameFinished(score, log);
    }
  }, [onGameFinished]);

  useEffect(() => {
    let game;

    // Dynamic import — Phaser is ESM and browser-only
    import('phaser').then((PhaserModule) => {
      const Phaser = PhaserModule.default ?? PhaserModule;

      // Expose to global so the scene class can reference it
      globalThis.Phaser = Phaser;

      const SceneClass = createArcheryScene(handleFinished);

      const config = {
        type: Phaser.AUTO,
        width:  GAME_W,
        height: GAME_H,
        backgroundColor: '#0d0d22',
        scale: {
          mode:       Phaser.Scale.HEIGHT_CONTROLS_WIDTH,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          parent:     containerRef.current,
          width:      GAME_W,
          height:     GAME_H,
        },
        scene: [SceneClass],
        input: { activePointers: 2 },
        render: { antialias: true },
      };

      game = new Phaser.Game(config);
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
        height:       '100%',
        width:        'auto',
        aspectRatio:  `${GAME_W} / ${GAME_H}`,
        maxWidth:     '100%',
        margin:       '0 auto',
        background:   '#0d0d22',
        borderRadius: '12px',
        overflow:     'hidden',
        boxShadow:    '0 0 40px rgba(0, 240, 255, 0.2)',
        touchAction:  'none',
        flexShrink:   0,
      }}
    />
  );
}
