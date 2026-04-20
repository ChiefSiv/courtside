// src/algorithm/matchup.js
//
// Evaluates matchup quality using real positional defensive data from Supabase
// (same data source as Matchup Analysis tab).
//
// Falls back to BDL team-level averages if positional data unavailable.

const STAT_MAP = {
  PTS: 'pts', REB: 'reb', AST: 'ast',
  '3PM': 'fg3m', STL: 'stl', BLK: 'blk',
  PRA: 'pts', PR: 'pts', PA: 'pts', RA: 'reb', DD: 'pts',
};

function getPositionGroup(position) {
  if (position === 'guard') return 'guards';
  if (position === 'wing')  return 'wings';
  if (position === 'big')   return 'bigs';
  return null;
}

function getStatKey(statType) {
  return STAT_MAP[statType] ?? null;
}

function nullMatchup(permissive = false) {
  return {
    qualifies:       permissive,
    strength:        permissive ? 5 : 0,
    dataUnavailable: true,
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
 * @param {{ statType, position, opponentTeamId, positionalMatchup, opponentDefStats, allDefensiveStats }} input
 * @returns {{ qualifies, strength, criteria, opponentAllowsPct, opponentRank }}
 */
export function evaluateMatchup({ statType, position, opponentTeamId, positionalMatchup, opponentDefStats, allDefensiveStats }) {

  // ── Path 1: Use real positional data from Supabase ──────────────────────
  if (positionalMatchup && opponentTeamId) {
    const teamData = positionalMatchup[opponentTeamId] ?? positionalMatchup[String(opponentTeamId)];
    if (teamData) {
      const group   = getPositionGroup(position);
      const statKey = getStatKey(statType);

      if (group && statKey && teamData[group]?.[statKey] != null) {
        const pctVsAvg = teamData[group][`${statKey}PctVsAvg`] ?? 0;

        // Criterion 1: opponent allows above league avg for this position/stat
        const opponentAllowsAboveAverage = pctVsAvg >= 0;

        // Criterion 2: rank among all teams (higher pct = worse defense = better for bettor)
        const allPcts = Object.values(positionalMatchup)
          .map(t => t[group]?.[`${statKey}PctVsAvg`] ?? 0)
          .filter(v => v != null)
          .sort((a, b) => a - b);
        const opponentRank   = allPcts.indexOf(pctVsAvg) + 1;
        const opponentBottomTen = opponentRank >= allPcts.length - 9;

        const criteriaCount = [opponentAllowsAboveAverage, opponentBottomTen].filter(Boolean).length;
        const qualifies     = pctVsAvg >= 0; // any above-average matchup qualifies

        const strength = Math.min(10, Math.max(0,
          (criteriaCount / 2) * 7 + Math.min(3, (Math.abs(pctVsAvg) / 10) * 3)
        ));

        return {
          qualifies,
          strength:          parseFloat(strength.toFixed(1)),
          dataUnavailable:   false,
          criteria: {
            opponentAllowsAboveAverage,
            opponentBottomTen,
            defensiveTrendWorsening: false,
          },
          opponentAllowsPct: parseFloat(pctVsAvg.toFixed(1)),
          opponentRank,
        };
      }
    }
  }

  // ── Path 2: Fall back to BDL team-level stats ───────────────────────────
  if (!opponentDefStats) return nullMatchup(true);

  const s = opponentDefStats?.stats ?? opponentDefStats ?? {};
  const statFallbackMap = {
    PTS: s.pts, REB: s.reb, AST: s.ast,
    '3PM': s.fg3m, STL: s.stl, BLK: s.blk,
    PRA: s.pts, PR: s.pts, PA: s.pts, RA: s.reb, DD: s.pts,
  };
  const allowed = statFallbackMap[statType] ?? null;
  if (allowed === null) return nullMatchup(true);

  const allAllowed = (allDefensiveStats ?? [])
    .map(() => statFallbackMap[statType] ?? null)
    .filter(v => v != null)
    .sort((a, b) => a - b);
  const leagueAvg = allAllowed.length
    ? allAllowed.reduce((a, b) => a + b, 0) / allAllowed.length
    : null;

  if (!leagueAvg) return nullMatchup(true);

  const pctVsAvg              = ((allowed - leagueAvg) / leagueAvg) * 100;
  const opponentAllowsAboveAverage = pctVsAvg >= 3;
  const opponentRank          = allAllowed.indexOf(allowed) + 1;
  const opponentBottomTen     = opponentRank >= allAllowed.length - 9;
  const criteriaCount         = [opponentAllowsAboveAverage, opponentBottomTen].filter(Boolean).length;
  const qualifies             = criteriaCount >= 1;
  const strength              = Math.min(10, (criteriaCount / 2) * 7 + Math.min(3, (Math.abs(pctVsAvg) / 10) * 3));

  return {
    qualifies,
    strength:          parseFloat(strength.toFixed(1)),
    dataUnavailable:   true,
    criteria: { opponentAllowsAboveAverage, opponentBottomTen, defensiveTrendWorsening: false },
    opponentAllowsPct: parseFloat(pctVsAvg.toFixed(1)),
    opponentRank,
  };
}