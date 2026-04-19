// src/algorithm/lineMovement.js

const PROP_TO_STAT = {
  points: 'PTS', rebounds: 'REB', assists: 'AST',
  three_pointers_made: '3PM', steals: 'STL', blocks: 'BLK',
  turnovers: 'TOV', points_rebounds_assists: 'PRA',
  points_rebounds: 'PR', points_assists: 'PA',
  rebounds_assists: 'RA', double_double: 'DD',
};

/**
 * getLineMovement
 * Uses cross-book line spread as a proxy for opening vs current line.
 *
 * @param {string} statType
 * @param {number} playerId
 * @param {number} currentLine
 * @param {Array}  allOdds - full BDL odds array
 * @returns {{ openingLine, currentLine, direction, delta } | null}
 */
export function getLineMovement(statType, playerId, currentLine, allOdds) {
  const relevant = allOdds.filter(
    o => o.player_id === playerId && PROP_TO_STAT[o.prop_type] === statType
  );
  if (!relevant.length) return null;

  const lines = relevant.map(o => parseFloat(o.line_value));
  const unique = [...new Set(lines)];
  if (unique.length < 2) return null;

  const minLine = Math.min(...unique);
  const maxLine = Math.max(...unique);
  const openingLine = minLine !== currentLine ? minLine : maxLine;

  const delta = currentLine - openingLine;
  return {
    openingLine,
    currentLine,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'none',
    delta: parseFloat(Math.abs(delta).toFixed(1)),
  };
}