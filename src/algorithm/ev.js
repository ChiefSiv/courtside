// src/algorithm/ev.js

export function americanToDecimal(american) {
  return american > 0 ? american / 100 + 1 : 100 / Math.abs(american) + 1;
}

export function americanToImplied(american) {
  return american > 0
    ? 100 / (american + 100)
    : Math.abs(american) / (Math.abs(american) + 100);
}

export function decimalToAmerican(decimal) {
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

/**
 * calculateNoVigOdds
 * Removes the book's vig to get fair implied probabilities.
 *
 * @param {number} overOdds  - American odds for Over
 * @param {number} underOdds - American odds for Under
 * @returns {{ fairPOver, fairPUnder, vigPct }}
 */
export function calculateNoVigOdds(overOdds, underOdds) {
  const overImp  = americanToImplied(overOdds);
  const underImp = americanToImplied(underOdds);
  const total    = overImp + underImp;

  return {
    fairPOver:  parseFloat((overImp  / total).toFixed(4)),
    fairPUnder: parseFloat((underImp / total).toFixed(4)),
    vigPct:     parseFloat(((total - 1) * 100).toFixed(2)),
  };
}

/**
 * calculateEV
 * EV = (modelProb × payout) − ((1 − modelProb) × 1)
 *
 * @param {number} modelProbability - 0–1
 * @param {number} americanOdds
 * @returns {{ ev, evPct, direction, modelProb, bookImpliedProb }}
 */
export function calculateEV(modelProbability, americanOdds, direction = 'over') {
  const decimal  = americanToDecimal(americanOdds);
  const payout   = decimal - 1;
  const ev       = modelProbability * payout - (1 - modelProbability);
  const implied  = americanToImplied(americanOdds);

  return {
    ev:              parseFloat(ev.toFixed(4)),
    evPct:           parseFloat((ev * 100).toFixed(2)),
    direction,       // explicit — caller knows if this is the over or under calc
    modelProb:       parseFloat(modelProbability.toFixed(3)),
    bookImpliedProb: parseFloat(implied.toFixed(3)),
  };
}

/** Returns CSS class name for EV badge coloring */
export function evColorClass(evPct) {
  if (evPct >= 5) return 'ev-strong';    // strong green
  if (evPct >  0) return 'ev-positive';  // light green
  return 'ev-negative';                  // gray
}