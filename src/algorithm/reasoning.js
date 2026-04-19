// src/algorithm/reasoning.js
// Generates the human-readable one-liner on each bet card.
// e.g. "Averaging 28.2 PTS over last 5. Opponent allows +4.4% to guards. Minutes trending up."

/**
 * generateReasoningText
 *
 * @param {{ statType, lineValue, direction, form, matchup, projection, availability }} input
 * @returns {string}
 */
export function generateReasoningText({ statType, lineValue, direction, form, matchup, projection, availability }) {
  const parts = [];

  // Recent form
  if (form.last5Avg > 0) {
    parts.push(`Averaging ${form.last5Avg} ${statType} over last 5 (season avg: ${form.seasonAvg})`);
  }

  // Matchup
  if (matchup.qualifies && matchup.opponentAllowsPct !== 0) {
    const sign = matchup.opponentAllowsPct > 0 ? '+' : '';
    parts.push(`Opponent allows ${sign}${matchup.opponentAllowsPct}% vs league avg`);
    if (matchup.criteria.opponentBottomTen) {
      parts.push(`Ranks bottom 10 defending ${statType}`);
    }
  }

  // Minutes trend
  if (availability.minutesSlope > 0) {
    parts.push('Minutes trending up');
  } else if (availability.minutesSlope === 0) {
    parts.push('Minutes stable');
  }

  // Usage shift from injuries
  if (projection.usageShift) {
    const { absentPlayerName, projectedStatDelta, statType: st } = projection.usageShift;
    const deltaStr = projectedStatDelta > 0 ? `+${projectedStatDelta}` : `${projectedStatDelta}`;
    parts.push(`${absentPlayerName} OUT → ${deltaStr} projected ${statType}`);
  }

  // Lineup TBD
  if (!availability.lineupConfirmed) {
    parts.push('Lineup TBD');
  }

  // Projection vs line
  const diff = projection.finalProjection - lineValue;
  if (direction === 'over' && diff > 0) {
    parts.push(`Model projects ${projection.finalProjection} (+${diff.toFixed(1)} vs line)`);
  } else if (direction === 'under' && diff < 0) {
    parts.push(`Model projects ${projection.finalProjection} (${diff.toFixed(1)} vs line)`);
  }

  return parts.length ? parts.join('. ') + '.' : `Model projects ${projection.finalProjection} ${statType}.`;
}