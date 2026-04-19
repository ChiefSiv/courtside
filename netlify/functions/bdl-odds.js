import { proxyWithCache, CORS_HEADERS, TTL } from './_cache.js';

// Odds uses v2 endpoint, different from the nba/v1 base
const BDL_V2 = 'https://api.balldontlie.io/v2';

async function bdlV2Fetch(path, params = {}) {
  const url = new URL(`${BDL_V2}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: process.env.BALLDONTLIE_API_KEY, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`BDL v2 ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.data ?? json;
}

async function bdlV1Fetch(path, params = {}) {
  const url = new URL(`https://api.balldontlie.io/nba/v1${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: process.env.BALLDONTLIE_API_KEY, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`BDL v1 ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.data ?? json;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };

  const date = event.queryStringParameters?.date ?? new Date().toISOString().split('T')[0];

  try {
    // Step 1: get today's games
    const games = await bdlV1Fetch('/games', { 'dates[]': date, per_page: '30' });
    const gameList = Array.isArray(games) ? games : [];

    if (!gameList.length) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ data: [], meta: { cachedAt: new Date().toISOString(), ageSeconds: 0, isStale: false, source: 'live' } }),
      };
    }

    // Step 2: fetch player props for each game using v2 endpoint
    const allOddsArrays = await Promise.all(
      gameList.map(async (game) => {
        try {
          const result = await proxyWithCache({
            cacheKey:   `odds:game:${game.id}`,
            ttlSeconds: TTL.odds,
            fetcher:    () => bdlV2Fetch('/odds/player_props', { game_id: String(game.id), per_page: '200' }),
          });
          return Array.isArray(result.data) ? result.data : [];
        } catch {
          return [];
        }
      })
    );

    const allOdds = allOddsArrays.flat();

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        data: allOdds,
        meta: { cachedAt: new Date().toISOString(), ageSeconds: 0, isStale: false, source: 'live' },
      }),
    };
  } catch (err) {
    return { statusCode: 503, headers: CORS_HEADERS, body: JSON.stringify({ error: String(err) }) };
  }
};