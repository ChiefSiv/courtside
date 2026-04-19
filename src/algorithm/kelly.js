// src/algorithm/kelly.js
// Kelly Criterion bet sizing
//
// Kelly formula: f = (b*p - q) / b
//   b = decimal payout (decimal odds - 1)
//   p = model probability of winning
//   q = 1 - p
//
// Fractional Kelly by section:
//   straight : 1/4 Kelly
//   leg      : 1/8 Kelly
//   longshot : 1/10 Kelly

import { americanToDecimal, decimalToAmerican } from './ev.js';

const KELLY_FRACTIONS = {
  straight: 0.25,
  leg:      0.125,
  longshot: 0.10,
};

/**
 * calculateKelly
 *
 * @param {number} modelProb    - 0–1 model probability of winning
 * @param {number} americanOdds - American odds for the chosen direction
 * @param {string} section      - 'straight' | 'leg' | 'longshot'
 * @param {number} bankroll     - user bankroll in dollars
 * @param {number} minBet       - minimum bet floor in dollars (default 1)
 * @param {number} maxBetPct    - max bet as fraction of bankroll (default 0.10)
 * @returns {{ units, dollars, fraction, kellyFull, isNoBet }}
 */
export function calculateKelly({
  modelProb,
  americanOdds,
  section    = 'straight',
  bankroll   = 1000,
  minBet     = 1,
  maxBetPct  = 0.10,
}) {
  const decimal = americanToDecimal(americanOdds);
  const b = decimal - 1;   // net payout per unit staked
  const p = modelProb;
  const q = 1 - p;

  // Full Kelly fraction of bankroll
  const kellyFull = b > 0 ? (b * p - q) / b : -1;

  // Negative or zero Kelly = no edge → hide pick
  if (kellyFull <= 0) {
    return { units: 0, dollars: 0, fraction: 0, kellyFull, isNoBet: true };
  }

  // Apply section fraction
  const fraction = kellyFull * (KELLY_FRACTIONS[section] ?? 0.25);

  // Convert to dollars, apply floor + ceiling
  const maxDollars = bankroll * maxBetPct;
  let dollars = Math.max(minBet, Math.min(maxDollars, fraction * bankroll));
  dollars = Math.round(dollars);

  // 1 unit = 1% of bankroll
  const units = parseFloat((dollars / (bankroll * 0.01)).toFixed(1));

  return {
    units,
    dollars,
    fraction:   parseFloat(fraction.toFixed(4)),
    kellyFull:  parseFloat(kellyFull.toFixed(4)),
    isNoBet:    false,
  };
}

/**
 * calculateParlayKelly
 * Sizes a parlay bet using combined probability and combined decimal odds.
 *
 * @param {Array}  legs       - Pick objects
 * @param {number} bankroll
 * @param {number} minBet
 * @param {number} maxBetPct
 * @returns {{ units, dollars, isNoBet }}
 */
export function calculateParlayKelly({ legs, bankroll = 1000, minBet = 1, maxBetPct = 0.10 }) {
  if (!legs?.length) return { units: 0, dollars: 0, isNoBet: true };

  const combinedProb = legs.reduce((p, leg) => p * leg.ev.modelProb, 1);

  const combinedDecimal = legs.reduce((d, leg) => {
    const odds = leg.ev.direction === 'over' ? leg.bestBook?.overOdds : leg.bestBook?.underOdds;
    return d * americanToDecimal(odds ?? -110);
  }, 1);

  const combinedAmerican = decimalToAmerican(combinedDecimal);

  return calculateKelly({
    modelProb:    combinedProb,
    americanOdds: combinedAmerican,
    section:      'leg',
    bankroll,
    minBet,
    maxBetPct,
  });
}