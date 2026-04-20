import { proxyWithCache, bdlFetch, TTL, CORS_HEADERS } from './_cache.js';

const BDL_V2 = 'https://api.balldontlie.io/v2';

async function bdlV2Fetch(path, params = {}) {
  const url = new URL(`${BDL_V2}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: process.env.BALLDONTLIE_API_KEY },
  });
  if (!res.ok) throw new Error(`BDL v2 ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  const date = event.queryStringParameters?.date ?? new Date().toISOString().split('T')[0];

  try {
    const result = await proxyWithCache({
      cacheKey:   `schedule:${date}`,
      ttlSeconds: TTL.schedule,
      fetcher:    async () => {
        // Fetch games
        const games = await bdlFetch('/games', { 'dates[]': date, per_page: '30' });
        const gameList = Array.isArray(games) ? games : (games.data ?? []);

        // Fetch game lines (totals + spreads) from v2 odds endpoint
        let gameLines = [];
        try {
          gameLines = await bdlV2Fetch('/odds', { 'dates[]': date, per_page: '50' });
          if (!Array.isArray(gameLines)) gameLines = gameLines.data ?? [];
        } catch {
          gameLines = [];
        }

        // Build a map of game_id -> best total/spread (prefer FanDuel, fallback to first)
        const linesMap = {};
        for (const line of gameLines) {
          if (!line.game_id) continue;
          if (!linesMap[line.game_id] || line.vendor === 'fanduel') {
            linesMap[line.game_id] = {
              over_under: line.total_value ? parseFloat(line.total_value) : null,
              spread:     line.spread_home_value ? parseFloat(line.spread_home_value) : null,
            };
          }
        }

        // Enrich games with lines
        const enriched = gameList.map(g => ({
          ...g,
          over_under: linesMap[g.id]?.over_under ?? null,
          spread:     linesMap[g.id]?.spread     ?? null,
        }));

        return enriched;
      },
    });
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 503, headers: CORS_HEADERS, body: JSON.stringify({ error: String(err) }) };
  }
};