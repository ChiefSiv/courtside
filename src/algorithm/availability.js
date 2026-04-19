// src/algorithm/availability.js
//
// AVAILABILITY GATE — all must be true:
//   - NOT listed as OUT or QUESTIONABLE
//   - Minutes trending stable or up (slope >= 0 over last 10)
//   - Lineup: permissive mode — show with "Lineup TBD" badge if not yet confirmed

import { mapPlayerStats, getMinutesFromString, linearRegressionSlope } from './utils.js';

/**
 * checkAvailability
 *
 * @param {{ injury, playerStats, isConfirmedStarter }} input
 *   injury            - BDL injury object for this player, or undefined
 *   playerStats       - array of BDL stat objects for this player
 *   isConfirmedStarter - boolean, set after lineups fetched (default false = TBD)
 * @returns {{ passes, isConfirmedStarter, injuryStatus, minutesSlope, lineupConfirmed }}
 */
export function checkAvailability({ injury, playerStats, isConfirmedStarter = false }) {
  const injuryStatus = injury?.status ?? null;
  const injuryBlocks = injuryStatus === 'OUT' || injuryStatus === 'QUESTIONABLE';

  if (injuryBlocks) {
    return {
      passes: false,
      isConfirmedStarter,
      injuryStatus,
      minutesSlope: 0,
      lineupConfirmed: isConfirmedStarter,
    };
  }

  const sorted = mapPlayerStats(playerStats).slice(0, 10);
  const minutesValues = sorted.map(s => getMinutesFromString(s.min)).reverse(); // oldest → newest
  const minutesSlope = linearRegressionSlope(minutesValues);
  const minutesTrendOk = minutesSlope >= 0;

  return {
    passes: minutesTrendOk,
    isConfirmedStarter,
    injuryStatus,
    minutesSlope: parseFloat(minutesSlope.toFixed(3)),
    lineupConfirmed: isConfirmedStarter,
  };
}