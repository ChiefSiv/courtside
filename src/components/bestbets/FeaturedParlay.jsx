// src/components/bestbets/FeaturedParlay.jsx

function formatOdds(o) { return o > 0 ? `+${o}` : `${o}`; }

export function FeaturedParlay({ parlay, getParlayKelly }) {
  if (!parlay) return null;
  const parlayKelly = getParlayKelly?.(parlay.legs);

  return (
    <div className="bb-featured-parlay">
      <div className="bb-featured-label">⭐ Featured Parlay — {new Date(parlay.generatedAt).toLocaleDateString()}</div>
      <div className="bb-featured-legs">
        {parlay.legs.map((leg, i) => (
          <span key={i} className="bb-featured-leg-pill">
            {leg.playerName} {leg.ev.direction === 'over' ? 'O' : 'U'} {leg.lineValue} {leg.stat}
          </span>
        ))}
      </div>
      <div className="bb-featured-stats">
        <span>Combined: <strong>{formatOdds(parlay.combinedOdds)}</strong></span>
        <span>Model prob: <strong>{Math.round(parlay.modelProb * 100)}%</strong></span>
        <span>EV: <strong style={{ color: parlay.evPct > 0 ? '#16a34a' : '#6b7280' }}>
          {parlay.evPct > 0 ? '+' : ''}{parlay.evPct.toFixed(1)}%
        </strong></span>
        {parlayKelly && !parlayKelly.isNoBet && (
          <span>Bet: <strong style={{ color: '#1d4ed8' }}>{parlayKelly.units}u (${parlayKelly.dollars})</strong></span>
        )}
        <span className={`bb-parlay-correlation ${parlay.correlationLabel}`}>
          {parlay.correlationLabel} correlation
        </span>
      </div>
    </div>
  );
}