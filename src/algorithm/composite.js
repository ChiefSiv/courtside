// src/algorithm/composite.js
// Weights: EV% 60%, Hit rate 15%, Matchup strength 15%, Form 10%
// Stars: composite / 2 → 0–5, half-star precision

const EV_MAX = 15; // EV above 15% = 10/10

/**
 * calculateCompositeScore
 *
 * @param {{ evPct, hitRate, matchupStrength, formStrength }} input
 *   evPct           - percent (e.g. 7.2)
 *   hitRate         - 0–100
 *   matchupStrength - 0–10
 *   formStrength    - 0–10
 * @returns {{ score, stars, breakdown }}
 */
export function calculateCompositeScore({ evPct, hitRate, matchupStrength, formStrength }) {
  const evScore       = Math.min(10, Math.max(0, (evPct / EV_MAX) * 10));
  const hitRateScore  = Math.min(10, Math.max(0, (hitRate / 100) * 10));
  const matchupScore  = Math.min(10, Math.max(0, matchupStrength));
  const formScore     = Math.min(10, Math.max(0, formStrength));

  const composite = evScore * 0.6 + hitRateScore * 0.15 + matchupScore * 0.15 + formScore * 0.1;
  const clamped   = Math.min(10, Math.max(0, composite));

  // Round to nearest 0.5 for half-star precision
  const stars = Math.round((clamped / 2) * 2) / 2;

  return {
    score: parseFloat(clamped.toFixed(1)),
    stars,
    breakdown: {
      evScore:      parseFloat(evScore.toFixed(1)),
      hitRateScore: parseFloat(hitRateScore.toFixed(1)),
      matchupScore: parseFloat(matchupScore.toFixed(1)),
      formScore:    parseFloat(formScore.toFixed(1)),
    },
  };
}