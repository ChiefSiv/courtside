// src/algorithm/probability.js
// Converts projection to P(over) / P(under) using a normal distribution
// built from the player's historical stat variance.

import { getStatValue, mapPlayerStats, stdDev } from './utils.js';

const DEFAULT_STD_DEV = {
  PTS: 5.5, REB: 2.5, AST: 2.0, '3PM': 1.2,
  STL: 0.8, BLK: 0.8, TOV: 1.0,
  PRA: 7.0, PR: 6.0, PA: 5.5, RA: 3.0, DD: 0.4,
};

// erf approximation — Abramowitz & Stegun, error < 1.5e-7
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592)
    * t * Math.exp(-x * x);
  return sign * y;
}

function normalCDF(x, mean, sd) {
  return 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2)));
}

/**
 * getProjectionProbability
 *
 * @param {number} projection - projected stat value
 * @param {Array}  stats      - BDL player stat objects (for variance)
 * @param {string} statType   - e.g. 'PTS'
 * @param {number} line       - the prop line
 * @returns {{ pOver, pUnder, stdDev }}
 */
export function getProjectionProbability(projection, stats, statType, line) {
  const sorted = mapPlayerStats(stats).slice(0, 40);
  const values = sorted.map(s => getStatValue(s, statType));

  const sd    = values.length >= 5 ? stdDev(values) : DEFAULT_STD_DEV[statType] ?? 3.0;
  const floor = (DEFAULT_STD_DEV[statType] ?? 3.0) * 0.4;
  const effectiveSd = Math.max(sd, floor);

  const pOver  = 1 - normalCDF(line, projection, effectiveSd);
  const pUnder = 1 - pOver;

  return {
    pOver:  parseFloat(Math.max(0.01, Math.min(0.99, pOver)).toFixed(3)),
    pUnder: parseFloat(Math.max(0.01, Math.min(0.99, pUnder)).toFixed(3)),
    stdDev: parseFloat(effectiveSd.toFixed(2)),
  };
}