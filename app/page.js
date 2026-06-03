export default function GameStartPage() {
  return (
    <div className="game-container">
      <div className="content-wrapper">
        <h1 className="game-title">Game</h1>

        <p className="game-subtitle">
          First-person archery challenge. Fight the wind. Hit the bullseye.
        </p>

        <a href="/game" className="play-button">
          Start Playing
        </a>

        <div className="features">
          <div className="feature-pill">🏹 3 Arrows</div>
          <div className="feature-pill">💨 Wind Drift</div>
          <div className="feature-pill">🎯 Bullseye</div>
        </div>
      </div>
    </div>
  );
}
