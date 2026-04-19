// ============================================================
// EXISTING — used by MatchupAnalysis, BettingAnalysis, etc.
// Routes through /api/* → Netlify redirect → BDL directly
// ============================================================
const API_KEY = import.meta.env.VITE_BDL_API_KEY;

export async function apiFetch(path) {
  const res = await fetch(`/api${path}`, {
    headers: { Authorization: API_KEY }
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ============================================================
// NEW — used by Best Bets only
// Routes through /.netlify/functions → cache layer → BDL
// Never exposes API key to browser
// ============================================================
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

export const fetchOdds           = (date)     => fetchProxy('bdl-odds',      { date });
export const fetchInjuries       = ()          => fetchProxy('bdl-injuries');
export const fetchSchedule       = (date)     => fetchProxy('bdl-schedule',  { date });
export const fetchPlayerStats    = (playerId) => fetchProxy('bdl-stats',     { player_id: String(playerId), seasons: '2025' });
export const fetchLineups        = (gameId)   => fetchProxy('bdl-lineups',   { game_id: String(gameId) });
export const fetchDefensiveStats = ()          => fetchProxy('bdl-defensive', { season: '2025' });

export function formatStaleAge(ageSeconds) {
  if (ageSeconds < 60)   return `${ageSeconds}s ago`;
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)} min ago`;
  return `${Math.floor(ageSeconds / 3600)}h ago`;
}