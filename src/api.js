// src/api.js
// ADD these exports to your existing api.js file.
// They call the Netlify proxy functions instead of BDL directly.

const BASE = import.meta.env.DEV
  ? 'http://localhost:8888/.netlify/functions'
  : '/.netlify/functions';

async function fetchProxy(endpoint, params = {}) {
  const url = new URL(`${BASE}/${endpoint}`, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Proxy ${res.status} from ${endpoint}`);
  return res.json();
}

export const fetchOdds          = (date)     => fetchProxy('bdl-odds',      { date });
export const fetchInjuries      = ()          => fetchProxy('bdl-injuries');
export const fetchSchedule      = (date)     => fetchProxy('bdl-schedule',  { date });
export const fetchPlayerStats   = (playerId) => fetchProxy('bdl-stats',     { player_id: String(playerId), seasons: '2025' });
export const fetchLineups       = (gameId)   => fetchProxy('bdl-lineups',   { game_id: String(gameId) });
export const fetchDefensiveStats     = ()         => fetchProxy('bdl-defensive',      { season: '2025' });
export const fetchPositionalMatchup  = ()         => fetchProxy('positional-matchup');

export function formatStaleAge(ageSeconds) {
  if (ageSeconds < 60)   return `${ageSeconds}s ago`;
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)} min ago`;
  return `${Math.floor(ageSeconds / 3600)}h ago`;
}