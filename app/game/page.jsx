'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

// Load the Phaser component only on the client side (no SSR)
const FirstPersonArchery = dynamic(
  () => import('../components/FirstPersonArchery'),
  { ssr: false, loading: () => <GameLoader /> }
);

function GameLoader() {
  return (
    <div className="game-loader">
      <div className="loader-spinner" />
      <p>Loading Game...</p>
    </div>
  );
}

function ResultsScreen({ score, shots, onRestart }) {
  const maxScore = 3 * 10;
  const pct = Math.round((score / maxScore) * 100);
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

export default function GamePage() {
  const [gameKey,  setGameKey]  = useState(0);
  const [results,  setResults]  = useState(null); // { score, shots }

  const handleGameFinished = useCallback((totalScore, shotsLog) => {
    setResults({ score: totalScore, shots: shotsLog });
  }, []);

  const handleRestart = useCallback(() => {
    setResults(null);
    setGameKey(k => k + 1); // remount Phaser
  }, []);

  return (
    <div className="game-page">
      {/* Header */}
      <header className="game-header">
        <h1 className="game-logo">🏹 Archery</h1>
        <p className="game-tagline">First Person · 3 Arrows · Wind Challenge</p>
      </header>

      {/* Game area */}
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
