import { proxyWithCache, TTL, CORS_HEADERS } from './_cache.js';

const BDL_BASE = 'https://api.balldontlie.io/nba/v1';

async function bdlStatsFetch(playerId, seasonList) {
  const url = new URL(`${BDL_BASE}/stats`);
  url.searchParams.set('player_ids[]', playerId);
  url.searchParams.set('per_page', '100');
  // Append each season as a separate seasons[] param
  for (const s of seasonList) {
    url.searchParams.append('seasons[]', s);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization:  process.env.BALLDONTLIE_API_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) throw new Error(`BDL ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.data ?? json;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };

  const playerId = event.queryStringParameters?.player_id;
  const seasons  = event.queryStringParameters?.seasons ?? '2024,2025';

  if (!playerId) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'player_id required' }) };

  const seasonList = seasons.split(',').map(s => s.trim()).filter(Boolean);

  try {
    const result = await proxyWithCache({
      cacheKey:   `stats:${playerId}:${seasons}`,
      ttlSeconds: TTL.stats,
      fetcher:    () => bdlStatsFetch(playerId, seasonList),
    });
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 503, headers: CORS_HEADERS, body: JSON.stringify({ error: String(err) }) };
  }
};