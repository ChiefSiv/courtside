// src/algorithm/projection.js
//
// full_projection =
//   baseline (season avg)
//   × form_adjustment
//   × matchup_adjustment   (injected by pipeline after evaluateMatchup)
//   × pace_adjustment
//   × rest_adjustment
//   × schedule_adjustment
//   × blowout_adjustment
//   × usage_shift_adjustment

import { getStatValue, mapPlayerStats, seasonAvg, daysBetweenGames } from './utils.js';

const SCORING_STATS = new Set(['PTS', 'PRA', 'PR', 'PA']);
const LEAGUE_AVG_TOTAL = 225;

function makeAdjustment(label, multiplier, currentProjection) {
  const delta = currentProjection * (multiplier - 1);
  return {
    label,
    multiplier: parseFloat(multiplier.toFixed(3)),
    delta: parseFloat(delta.toFixed(2)),
    color: multiplier > 1.005 ? 'green' : multiplier < 0.995 ? 'red' : 'gray',
  };
}

// ---- Usage Shift Module -------------------------------------

function getUsageShift({ statType, injuries, playerStats, sorted, currentProjection }) {
  const confirmedOut = injuries.filter(i => i.status === 'OUT');
  if (!confirmedOut.length) return null;

  let bestShift = null;
  let bestDelta = 0;

  for (const absentPlayer of confirmedOut) {
    const absentStats = playerStats[absentPlayer.player_id] ?? [];
    if (!absentStats.length) continue;

    const absentGameIds = new Set(absentStats.map(s => s.game.id));
    const gamesWithoutAbsent = sorted.filter(s => !absentGameIds.has(s.game.id));
    const gamesWithAbsent    = sorted.filter(s => absentGameIds.has(s.game.id));

    const sampleSize = gamesWithoutAbsent.length;
    if (sampleSize < 3) continue; // required fallback: skip if fewer than 3 games

    const avgWithout = gamesWithoutAbsent.reduce((s, g) => s + getStatValue(g, statType), 0) / gamesWithoutAbsent.length;
    const avgWith    = gamesWithAbsent.length > 0
      ? gamesWithAbsent.reduce((s, g) => s + getStatValue(g, statType), 0) / gamesWithAbsent.length
      : avgWithout;

    if (avgWith === 0) continue;

    const rawMultiplier = avgWithout / avgWith;
    const multiplier    = Math.max(0.9, Math.min(1.25, rawMultiplier));
    const projectedDelta = currentProjection * (multiplier - 1);

    if (Math.abs(projectedDelta) <= Math.abs(bestDelta)) continue;
    bestDelta = projectedDelta;

    // 3–9 games = low confidence, 10+ = high confidence
    const confidence = sampleSize >= 10 ? 'high' : 'low';
    const absentName = `${absentPlayer.player.first_name} ${absentPlayer.player.last_name}`;
    const deltaStr   = projectedDelta > 0 ? `+${projectedDelta.toFixed(1)}` : projectedDelta.toFixed(1);

    bestShift = {
      absentPlayerId: absentPlayer.player_id,
      absentPlayerName: absentName,
      multiplier: parseFloat(multiplier.toFixed(3)),
      projectedStatDelta: parseFloat(projectedDelta.toFixed(1)),
      sampleSize,
      confidence,
      label: `⚡ Usage boost: ${deltaStr} projected ${statType} with ${absentName} out (${confidence} confidence, ${sampleSize} prior games)`,
    };
  }

  return bestShift;
}

// ---- Rest helpers -------------------------------------------

function getRestDays(sorted, game) {
  if (!sorted.length) return 2;
  return Math.floor(daysBetweenGames(sorted[0].game.date, game.date));
}

function getScheduleMultiplier(sorted, game) {
  const gameMs   = new Date(game.date).getTime();
  const recentMs = sorted.slice(0, 6).map(s => new Date(s.game.date).getTime());

  const last2Days = recentMs.filter(d => gameMs - d <= 2  * 86400000).length;
  const last4Days = recentMs.filter(d => gameMs - d <= 4  * 86400000).length;
  const last6Days = recentMs.filter(d => gameMs - d <= 6  * 86400000).length;

  if (last6Days >= 3) return 0.96; // 4-in-6
  if (last4Days >= 2) return 0.97; // 3-in-4
  if (last2Days >= 1) return 0.98; // B2B
  return 1.0;
}

// ---- Main export --------------------------------------------

/**
 * getProjection
 *
 * @param {{ stats, statType, game, matchupMultiplier, injuries, playerStats }} input
 *   matchupMultiplier - injected from evaluateMatchup result (default 1.0)
 * @returns {{ baseline, adjustments, finalProjection, usageShift, confidence }}
 */
export function getProjection({ stats, statType, game, matchupMultiplier = 1.0, injuries = [], playerStats = {} }) {
  const sorted   = mapPlayerStats(stats);
  const baseline = seasonAvg(sorted, statType);

  if (baseline === 0) {
    return { baseline: 0, adjustments: [], finalProjection: 0, usageShift: null, confidence: 'low' };
  }

  const adjustments = [];
  let projection = baseline;

  // 1. Form adjustment (60% last5, 40% last10 vs season avg)
  const last5  = sorted.slice(0, 5);
  const last10 = sorted.slice(0, 10);
  const last5Avg  = last5.length  ? last5.reduce((s, g)  => s + getStatValue(g, statType), 0) / last5.length  : baseline;
  const last10Avg = last10.length ? last10.reduce((s, g) => s + getStatValue(g, statType), 0) / last10.length : baseline;
  const recentAvg = last5Avg * 0.6 + last10Avg * 0.4;
  const formMultiplier = Math.max(0.85, Math.min(1.20, baseline > 0 ? recentAvg / baseline : 1));

  adjustments.push(makeAdjustment('Form adjustment', formMultiplier, projection));
  projection *= formMultiplier;

  // 2. Matchup adjustment (injected from evaluateMatchup)
  const matchupClamped = Math.max(0.90, Math.min(1.15, matchupMultiplier));
  adjustments.push(makeAdjustment('Matchup adjustment', matchupClamped, projection));
  projection *= matchupClamped;

  // 3. Pace adjustment
  const gameTotal  = game.over_under ?? LEAGUE_AVG_TOTAL;
  const paceRatio  = gameTotal / LEAGUE_AVG_TOTAL;
  const paceSens   = SCORING_STATS.has(statType) ? 1.0 : 0.5;
  const paceMult   = Math.max(0.95, Math.min(1.06, 1 + (paceRatio - 1) * paceSens * 0.15));

  adjustments.push(makeAdjustment('Pace adjustment', paceMult, projection));
  projection *= paceMult;

  // 4. Rest adjustment
  const restDays = getRestDays(sorted, game);
  const restMult = restDays === 0 ? 0.98 : restDays >= 2 ? 1.01 : 1.00;

  adjustments.push(makeAdjustment('Rest adjustment', restMult, projection));
  projection *= restMult;

  // 5. Schedule adjustment
  const schedMult = getScheduleMultiplier(sorted, game);
  adjustments.push(makeAdjustment('Schedule adjustment', schedMult, projection));
  projection *= schedMult;

  // 6. Blowout adjustment
  const spread      = Math.abs(game.spread ?? 0);
  const blowoutMult = spread >= 12 ? 0.97 : 1.0;
  adjustments.push(makeAdjustment('Blowout adjustment', blowoutMult, projection));
  projection *= blowoutMult;

  // 7. Usage shift
  const usageShift = getUsageShift({ statType, injuries, playerStats, sorted, currentProjection: projection });
  if (usageShift) {
    adjustments.push({
      label: usageShift.label,
      multiplier: usageShift.multiplier,
      delta: parseFloat((projection * (usageShift.multiplier - 1)).toFixed(2)),
      color: usageShift.multiplier >= 1 ? 'green' : 'red',
    });
    projection *= usageShift.multiplier;
  }

  const confidence = sorted.length >= 20 ? 'high' : sorted.length >= 10 ? 'medium' : 'low';

  return {
    baseline: parseFloat(baseline.toFixed(1)),
    adjustments,
    finalProjection: parseFloat(projection.toFixed(1)),
    usageShift,
    confidence,
  };
}