// src/algorithm/parlay.js
// Correlation rules + featured parlay selection

import { americanToDecimal, decimalToAmerican } from './ev.js';

// ---- Combinations helper ------------------------------------

function getCombinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [
    ...getCombinations(rest, k - 1).map(c => [first, ...c]),
    ...getCombinations(rest, k),
  ];
}

// ---- Parlay math --------------------------------------------

function calcParlayStats(legs) {
  let combinedDecimal = 1;
  let modelProb       = 1;
  let bookImpliedProb = 1;

  for (const leg of legs) {
    const odds = leg.ev.direction === 'over' ? leg.bestBook.overOdds : leg.bestBook.underOdds;
    combinedDecimal *= americanToDecimal(odds);
    modelProb       *= leg.ev.modelProb;
    bookImpliedProb *= leg.ev.bookImpliedProb;
  }

  const payout = combinedDecimal - 1;
  const ev     = modelProb * payout - (1 - modelProb);

  return {
    combinedOdds:   decimalToAmerican(combinedDecimal),
    modelProb:      parseFloat(modelProb.toFixed(4)),
    bookImpliedProb: parseFloat(bookImpliedProb.toFixed(4)),
    evPct:          parseFloat((ev * 100).toFixed(2)),
  };
}

// ---- Correlation rule set -----------------------------------

/**
 * evaluateParlayCorrelation
 *
 * @param {Array} legs - Pick objects
 * @returns {'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'}
 */
export function evaluateParlayCorrelation(legs) {
  if (legs.length < 2) return 'NEUTRAL';

  const allDiffGames = new Set(legs.map(l => l.gameId)).size === legs.length;
  if (allDiffGames) return 'NEUTRAL';

  // Same player, multiple stats → POSITIVE
  const uniquePlayers = new Set(legs.map(l => l.playerId));
  if (uniquePlayers.size < legs.length) return 'POSITIVE';

  const uniqueTeams = new Set(legs.map(l => l.playerTeam));
  const allOvers    = legs.every(l => l.ev.direction === 'over');
  const allSameGame = new Set(legs.map(l => l.gameId)).size === 1;

  // Same team, all Overs → POSITIVE
  if (uniqueTeams.size === 1 && allOvers) return 'POSITIVE';

  // Same team, Over PTS + Under direction → NEGATIVE
  const hasPtsOver    = legs.some(l => l.stat === 'PTS' && l.ev.direction === 'over');
  const hasUnder      = legs.some(l => l.ev.direction === 'under');
  if (uniqueTeams.size === 1 && hasPtsOver && hasUnder) return 'NEGATIVE';

  // Opposing teams, same game, all Overs → POSITIVE (shootout)
  if (allSameGame && allOvers && uniqueTeams.size === 2) return 'POSITIVE';

  return 'NEUTRAL';
}

/**
 * selectFeaturedParlay
 * Finds the highest composite-EV combo of 2–3 legs with POSITIVE correlation.
 *
 * @param {Array} qualifyingLegs - ranked parlay leg picks
 * @returns {Object|null}
 */
export function selectFeaturedParlay(qualifyingLegs) {
  if (qualifyingLegs.length < 2) return null;

  const top = qualifyingLegs.slice(0, 10);
  let best  = null;
  let bestScore = -Infinity;

  const combos = [...getCombinations(top, 2), ...getCombinations(top, 3)];

  for (const combo of combos) {
    const correlation = evaluateParlayCorrelation(combo);
    if (correlation === 'NEGATIVE') continue;

    const { combinedOdds, modelProb, bookImpliedProb, evPct } = calcParlayStats(combo);
    const avgComposite = combo.reduce((s, l) => s + l.composite.score, 0) / combo.length;
    const score = avgComposite * evPct;

    if (score > bestScore) {
      bestScore = score;
      best = {
        legs: combo,
        combinedOdds,
        modelProb,
        bookImpliedProb,
        evPct,
        correlationLabel: correlation,
        generatedAt: new Date().toISOString(),
      };
    }
  }

  return best;
}