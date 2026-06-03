export default function GameStartPage() {
  return (
    <div className="game-container">
      <div className="content-wrapper">
        <h1 className="game-title">Game</h1>
        
        <p className="game-subtitle">
          Experience the next level of mobile gaming. Tap to begin your journey.
        </p>

        <button className="play-button">
          Start Playing
        </button>

        <div className="features">
          <div className="feature-pill">Epic Quests</div>
          <div className="feature-pill">Multiplayer</div>
        </div>
      </div>
    </div>
  );
}
