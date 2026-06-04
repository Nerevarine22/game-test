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

// ─── Main page ────────────────────────────────────────────────────────────────
export default function GamePage() {
  const [gameKey,    setGameKey]    = useState(0);
  const [results,    setResults]    = useState(null);

  const handleGameFinished = useCallback((totalScore, shotsLog) => {
    setResults({ score: totalScore, shots: shotsLog });
  }, []);

  const handleRestart = useCallback(() => {
    setResults(null);
    setGameKey(k => k + 1);
  }, []);

  // Show header only on non-game screens (results).
  // During active gameplay the Phaser canvas has its own HUD.
  const showHeader = results !== null;

  return (
    <div className={`game-page ${showHeader ? '' : 'game-page--fullplay'}`}>
      {showHeader && (
        <header className="game-header">
          <h1 className="game-logo">🏹 Archery</h1>
          <p className="game-tagline">First Person · 3 Arrows · Drag to Aim</p>
        </header>
      )}

      <main className="game-main">
        {results ? (
          <ResultsScreen
            score={results.score}
            shots={results.shots}
            onRestart={handleRestart}
          />
        ) : (
          <FirstPersonArchery
            key={gameKey}
            onGameFinished={handleGameFinished}
          />
        )}
      </main>
    </div>
  );
}
