'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

// Load the Phaser component only on the client side (no SSR)
const FirstPersonArchery = dynamic(
  () => import('../components/FirstPersonArchery'),
  { ssr: false, loading: () => <GameLoader /> }
);

// ─── Loading spinner ──────────────────────────────────────────────────────────
function GameLoader() {
  return (
    <div className="game-loader">
      <div className="loader-spinner" />
      <p>Loading Game...</p>
    </div>
  );
}

// ─── iOS Gyro Permission Gate ─────────────────────────────────────────────────
// On iOS 13+ DeviceOrientationEvent.requestPermission must be called from a
// direct user gesture (tap). We show this screen first on iOS, then mount Phaser.
function GyroPermissionScreen({ onGranted, onDenied }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'requesting' | 'denied'

  const handleRequest = useCallback(async () => {
    setStatus('requesting');
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result === 'granted') {
        onGranted();
      } else {
        setStatus('denied');
        onDenied();
      }
    } catch (err) {
      console.warn('DeviceOrientation permission error:', err);
      // Treat errors (e.g. already granted) as granted
      onGranted();
    }
  }, [onGranted, onDenied]);

  return (
    <div className="gyro-permission-screen">
      <div className="gyro-card">
        <div className="gyro-icon">📱</div>
        <h2 className="gyro-title">Motion Controls</h2>
        <p className="gyro-desc">
          This game uses your phone's gyroscope to aim.<br />
          Tilt your phone to move the target — tap to shoot.
        </p>

        {status === 'denied' ? (
          <p className="gyro-denied">
            ⚠️ Permission denied. Please allow motion access in<br />
            <strong>Settings → Safari → Motion &amp; Orientation Access</strong>
          </p>
        ) : (
          <button
            className="btn-gyro-grant"
            onClick={handleRequest}
            disabled={status === 'requesting'}
          >
            {status === 'requesting' ? 'Requesting…' : '🎯 Enable Motion &amp; Play'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Results screen ───────────────────────────────────────────────────────────
function ResultsScreen({ score, shots, onRestart }) {
  const maxScore = 3 * 10;
  const rank =
    score >= 25 ? 'Master Archer 🏆' :
    score >= 18 ? 'Skilled Archer 🥈' :
    score >= 10 ? 'Apprentice Archer 🥉' :
    'Keep Practising 🎯';

  return (
    <div className="results-screen">
      <h2 className="results-title">Round Complete!</h2>

      <div className="score-circle">
        <span className="score-number">{score}</span>
        <span className="score-max">/ {maxScore}</span>
      </div>

      <p className="rank-label">{rank}</p>

      <div className="shots-log">
        {shots.map((s, i) => (
          <div key={i} className="shot-row">
            <span className="shot-num">Arrow {i + 1}</span>
            <span className="shot-dist">{s.dist}px from center</span>
            <span className={`shot-score ${s.score === 0 ? 'miss' : ''}`}>
              {s.score === 0 ? 'Miss' : `+${s.score}`}
            </span>
          </div>
        ))}
      </div>

      <button className="btn-restart" onClick={onRestart}>
        Play Again
      </button>
    </div>
  );
}

// ─── Detect iOS (needs permission dialog) ─────────────────────────────────────
function needsGyroPermission() {
  if (typeof window === 'undefined') return false;
  return (
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function'
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function GamePage() {
  const [gameKey,    setGameKey]    = useState(0);
  const [results,    setResults]    = useState(null);
  // 'pending' = not yet decided, 'granted' = ready to play, 'denied' = blocked
  const [gyroStatus, setGyroStatus] = useState(() =>
    needsGyroPermission() ? 'pending' : 'granted'
  );

  const handleGameFinished = useCallback((totalScore, shotsLog) => {
    setResults({ score: totalScore, shots: shotsLog });
  }, []);

  const handleRestart = useCallback(() => {
    setResults(null);
    setGameKey(k => k + 1);
  }, []);

  const handleGyroGranted = useCallback(() => setGyroStatus('granted'), []);
  const handleGyroDenied  = useCallback(() => setGyroStatus('denied'),  []);

  // Show header only on non-game screens (results / permission).
  // During active gameplay the Phaser canvas has its own HUD.
  const showHeader = results !== null || gyroStatus === 'pending';

  return (
    <div className={`game-page ${showHeader ? '' : 'game-page--fullplay'}`}>
      {showHeader && (
        <header className="game-header">
          <h1 className="game-logo">🏹 Archery</h1>
          <p className="game-tagline">First Person · 3 Arrows · Gyro Aim</p>
        </header>
      )}

      <main className="game-main">
        {results ? (
          <ResultsScreen
            score={results.score}
            shots={results.shots}
            onRestart={handleRestart}
          />
        ) : gyroStatus === 'pending' ? (
          <GyroPermissionScreen
            onGranted={handleGyroGranted}
            onDenied={handleGyroDenied}
          />
        ) : (
          <FirstPersonArchery
            key={gameKey}
            onGameFinished={handleGameFinished}
            gyroPermissionGranted={gyroStatus === 'granted'}
          />
        )}
      </main>
    </div>
  );
}
