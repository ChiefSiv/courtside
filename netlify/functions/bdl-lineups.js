import { proxyWithCache, bdlFetch, TTL, CORS_HEADERS } from './_cache.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  const gameId = event.queryStringParameters?.game_id;
  if (!gameId) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'game_id required' }) };
  try {
    const result = await proxyWithCache({
      cacheKey:   `lineups:${gameId}`,
      ttlSeconds: TTL.lineups,
      fetcher:    () => bdlFetch('/lineups', { game_id: gameId, per_page: '30' }),
    });
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 503, headers: CORS_HEADERS, body: JSON.stringify({ error: String(err) }) };
  }
};