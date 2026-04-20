// netlify/functions/positional-matchup.js
//
// Queries Supabase player_stats to compute positional defensive grades
// for every NBA team. Uses the same logic as MatchupAnalysis.jsx.
//
// Returns: { [teamId]: { guards, wings, bigs, leagueAvg } }
// Cached for 6 hours.

import { createClient } from '@supabase/supabase-js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type':                 'application/json',
};

const CACHE_TTL_SECONDS = 6 * 60 * 60; // 6 hours
const CURRENT_SEASON    = 2025;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Position group tests — matches MatchupAnalysis.jsx exactly
const POS_GROUPS = {
  guards: p => p === 'G' || p === 'G-F',
  wings:  p => p === 'F' || p === 'F-G' || p === 'F-C',
  bigs:   p => p === 'C' || p === 'C-F',
};

const STATS = ['pts', 'reb', 'ast', 'fg3m', 'stl', 'blk'];

// Per-game-per-team average for a position group and stat
function calcPerGameByGroup(rows, posTest, statKey) {
  const byGameTeam = {};
  for (const s of rows) {
    if (!posTest(s.player_position)) continue;
    const key = `${s.game_id}__${s.team_id}`;
    byGameTeam[key] = (byGameTeam[key] ?? 0) + (s[statKey] ?? 0);
  }
  const vals = Object.values(byGameTeam);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  try {
    // Check cache first
    const cacheKey = `positional-matchup:${CURRENT_SEASON}`;
    const { data: cached } = await supabase
      .from('api_cache')
      .select('data, fetched_at')
      .eq('cache_key', cacheKey)
      .single();

    if (cached) {
      const ageSeconds = (Date.now() - new Date(cached.fetched_at).getTime()) / 1000;
      if (ageSeconds < CACHE_TTL_SECONDS) {
        return {
          statusCode: 200,
          headers: { ...CORS_HEADERS, 'X-Cache': 'HIT' },
          body: cached.data,
        };
      }
    }

    // Fetch all player stats for the season (paginated)
    let allStats = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data: page, error } = await supabase
        .from('player_stats')
        .select('game_id, team_id, player_position, pts, reb, ast, fg3m, stl, blk')
        .eq('season', CURRENT_SEASON)
        .not('min', 'is', null)
        .neq('min', '0:00')
        .neq('min', '00')
        .range(from, from + pageSize - 1);

      if (error) throw new Error('Stats query failed: ' + error.message);
      if (!page.length) break;
      allStats = allStats.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    // Fetch all games to build opponent lookup
    let allGames = [];
    let gFrom = 0;
    while (true) {
      const { data: page, error } = await supabase
        .from('games')
        .select('id, home_team_id, visitor_team_id')
        .eq('season', CURRENT_SEASON)
        .eq('status', 'Final')
        .range(gFrom, gFrom + 499);

      if (error) throw new Error('Games query failed: ' + error.message);
      if (!page.length) break;
      allGames = allGames.concat(page);
      if (page.length < 500) break;
      gFrom += 500;
    }

    // Build map: game_id -> opponent team_id for each team
    // For each game, stats from team A were scored AGAINST team B (and vice versa)
    const gameOpponentMap = {}; // gameOpponentMap[game_id][team_id] = opponent_team_id
    for (const g of allGames) {
      gameOpponentMap[g.id] = {
        [g.home_team_id]:    g.visitor_team_id,
        [g.visitor_team_id]: g.home_team_id,
      };
    }

    // Group stats by the DEFENDING team (opponent of the scoring team)
    // i.e. if a guard scored 20 pts against BOS, attribute those 20pts to BOS's defense
    const statsByDefender = {}; // { [defending_team_id]: stat_row[] }
    for (const s of allStats) {
      const opponents = gameOpponentMap[s.game_id];
      if (!opponents) continue;
      const defendingTeamId = opponents[s.team_id];
      if (!defendingTeamId) continue;
      if (!statsByDefender[defendingTeamId]) statsByDefender[defendingTeamId] = [];
      statsByDefender[defendingTeamId].push(s);
    }

    // Compute league averages (all stats, all defenders)
    const leagueAvg = {};
    for (const [group, posTest] of Object.entries(POS_GROUPS)) {
      leagueAvg[group] = {};
      for (const stat of STATS) {
        leagueAvg[group][stat] = parseFloat(calcPerGameByGroup(allStats, posTest, stat).toFixed(2));
      }
    }

    // Compute per-team positional defense
    const result = {};
    const allTeamIds = [...new Set(allGames.flatMap(g => [g.home_team_id, g.visitor_team_id]))];

    for (const teamId of allTeamIds) {
      const rows = statsByDefender[teamId] ?? [];
      result[teamId] = { leagueAvg };

      for (const [group, posTest] of Object.entries(POS_GROUPS)) {
        result[teamId][group] = {};
        for (const stat of STATS) {
          const allowed    = parseFloat(calcPerGameByGroup(rows, posTest, stat).toFixed(2));
          const lgAvg      = leagueAvg[group][stat] || 1;
          const pctVsAvg   = parseFloat(((allowed - lgAvg) / lgAvg * 100).toFixed(1));
          result[teamId][group][stat]      = allowed;
          result[teamId][group][`${stat}PctVsAvg`] = pctVsAvg;
        }
      }
    }

    const body = JSON.stringify({ data: result, meta: { season: CURRENT_SEASON, teams: allTeamIds.length, statRows: allStats.length } });

    // Store in cache — fire and forget, don't let cache write failures break the response
    supabase.from('api_cache').upsert({
      cache_key:  cacheKey,
      data:       body,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'cache_key' }).then(({ error }) => {
      if (error) console.error('Cache write error:', error.message);
    });

    return { statusCode: 200, headers: { ...CORS_HEADERS, 'X-Cache': 'MISS' }, body };

  } catch (err) {
    console.error('positional-matchup error:', err);
    return { statusCode: 503, headers: CORS_HEADERS, body: JSON.stringify({ error: String(err) }) };
  }
};