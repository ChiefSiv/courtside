// src/algorithm/form.js
import { getStatValue, mapPlayerStats, linearRegressionSlope, getMinutesFromString, seasonAvg } from './utils.js';

export function evaluateForm({ stats, statType, lineValue, direction = 'over' }) {
  const sorted = mapPlayerStats(stats);

  if (sorted.length < 5) {
    const sAvg = seasonAvg(sorted, statType);
    return {
      qualifies: false, strength: 0,
      criteria: { last5AboveSeasonAvg: false, last3HitLine: false, usageOrMinutesTrendingUp: false },
      last5Avg: sAvg, seasonAvg: sAvg, minutesSlope: 0, usageSlope: 0,
    };
  }

  const sAvg     = seasonAvg(sorted, statType);
  const last5    = sorted.slice(0, 5);
  const last5Avg = last5.reduce((s, g) => s + getStatValue(g, statType), 0) / 5;

  // Direction-aware: overs want trending up, unders want trending down
  const last5AboveSeasonAvg = direction === 'over' ? last5Avg > sAvg : last5Avg < sAvg;
  const last3HitLine = direction === 'over'
    ? sorted.slice(0, 3).every(s => getStatValue(s, statType) > lineValue)
    : sorted.slice(0, 3).every(s => getStatValue(s, statType) < lineValue);

  const last10MinValues = sorted.slice(0, 10).map(s => getMinutesFromString(s.min)).reverse();
  const minutesSlope = linearRegressionSlope(last10MinValues);
  // For unders, declining minutes is actually fine — don't penalize
  const usageOrMinutesTrendingUp = direction === 'over' ? minutesSlope > 0 : true;

  const criteriaCount = [last5AboveSeasonAvg, last3HitLine, usageOrMinutesTrendingUp].filter(Boolean).length;
  const qualifies = criteriaCount >= 2; // relaxed from 3 — 2-of-3 is enough

  const baseStrength = (criteriaCount / 3) * 6;
  const formMargin   = sAvg > 0 ? Math.min(4, (Math.abs(last5Avg - sAvg) / sAvg) * 20) : 0;
  const strength     = Math.min(10, baseStrength + Math.max(0, formMargin));

  return {
    qualifies,
    strength: parseFloat(strength.toFixed(1)),
    criteria: { last5AboveSeasonAvg, last3HitLine, usageOrMinutesTrendingUp },
    last5Avg:     parseFloat(last5Avg.toFixed(1)),
    seasonAvg:    parseFloat(sAvg.toFixed(1)),
    minutesSlope: parseFloat(minutesSlope.toFixed(3)),
    usageSlope:   parseFloat(minutesSlope.toFixed(3)),
  };
}