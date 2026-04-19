// src/algorithm/matchup.js
//
// FAVORABLE MATCHUP: any 2 of 3 criteria must be true
//   1. Opponent allows >= +3% vs league avg for position/stat
//   2. Opponent ranks in bottom 10 defending that stat
//   3. Opponent defensive trend worsening (last 16 games)
//
// NOTE: BDL's team_season_averages/general endpoint returns team-level
// totals (pts, reb, ast, etc.) but NOT positional breakdowns.
// When positional data is unavailable we fall back to team-level pts/reb/ast
// and treat matchup as qualifying (permissive) so picks can still flow through.

function getTeamLevelValue(teamStat, statType) {
  // BDL returns stats.pts, stats.reb, stats.ast etc. — opponent allowed ≈ opponent's defensive numbers
  // We use the opponent's stats as a proxy: higher pts allowed = weaker defense
  const s = teamStat?.stats ?? teamStat ?? {};
  switch (statType) {
    case 'PTS': case 'PR': case 'PA': case 'PRA': return s.pts   ?? null;
    case 'REB': case 'RA':                         return s.reb   ?? null;
    case 'AST':                                    return s.ast   ?? null;
    case '3PM':                                    return s.fg3m  ?? null;
    case 'STL':                                    return s.stl   ?? null;
    case 'BLK':                                    return s.blk   ?? null;
    default:                                       return null;
  }
}

function nullMatchup(permissive = false) {
  return {
    qualifies:        permissive, // true when data unavailable (don't block picks)
    strength:         permissive ? 5 : 0,
    dataUnavailable:  true,
    criteria: {
      opponentAllowsAboveAverage: false,
      opponentBottomTen:          false,
      defensiveTrendWorsening:    false,
    },
    opponentAllowsPct: 0,
    opponentRank:      15,
  };
}

/**
 * evaluateMatchup
 *
 * @param {{ statType, position, opponentDefStats, allDefensiveStats }} input
 * @returns {{ qualifies, strength, criteria, opponentAllowsPct, opponentRank }}
 */
export function evaluateMatchup({ statType, position, opponentDefStats, allDefensiveStats }) {
  if (!opponentDefStats) return nullMatchup(true);

  // Try positional lookup first (future-proofing when BDL adds positional data)
  const posKey = position === 'guard' ? 'guards' : position === 'wing' ? 'wings' : 'bigs';
  const posAllowed   = opponentDefStats[`pts_allowed_${posKey}`] ?? null;
  const posLeagueAvg = opponentDefStats[`league_avg_pts_${posKey}`] ?? null;

  // Fall back to team-level stats if no positional data
  const allowed   = posAllowed   ?? getTeamLevelValue(opponentDefStats, statType);
  const leagueAvg = posLeagueAvg ?? (() => {
    if (!allDefensiveStats?.length) return null;
    const vals = allDefensiveStats
      .map(t => getTeamLevelValue(t, statType))
      .filter(v => v != null && v > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  })();

  // If we genuinely have no data, pass permissively
  if (allowed === null || leagueAvg === null || leagueAvg === 0) return nullMatchup(true);

  // Criterion 1: opponent allows >= +3% above league avg
  const pctVsAvg = ((allowed - leagueAvg) / leagueAvg) * 100;
  const opponentAllowsAboveAverage = pctVsAvg >= 3;

  // Criterion 2: bottom 10 in defending
  const allAllowed = (allDefensiveStats ?? [])
    .map(t => getTeamLevelValue(t, statType))
    .filter(v => v !== null)
    .sort((a, b) => a - b);

  const opponentRank = allAllowed.indexOf(allowed) + 1;
  const opponentBottomTen = allAllowed.length > 0 && opponentRank >= allAllowed.length - 9;

  // Criterion 3: trend worsening — TODO: rolling window
  const defensiveTrendWorsening = false;

  const criteriaCount = [
    opponentAllowsAboveAverage,
    opponentBottomTen,
    defensiveTrendWorsening,
  ].filter(Boolean).length;

  // Qualify if 2-of-3 pass, OR if no positional data was available (permissive fallback)
  const qualifies = criteriaCount >= 2 || posAllowed === null;

  const baseStrength = (criteriaCount / 3) * 7;
  const marginBonus  = Math.min(3, (Math.abs(pctVsAvg) / 10) * 3);
  const strength     = Math.min(10, baseStrength + marginBonus);

  return {
    qualifies,
    strength: parseFloat(strength.toFixed(1)),
    dataUnavailable: posAllowed === null,
    criteria: { opponentAllowsAboveAverage, opponentBottomTen, defensiveTrendWorsening },
    opponentAllowsPct: parseFloat(pctVsAvg.toFixed(1)),
    opponentRank,
  };
}