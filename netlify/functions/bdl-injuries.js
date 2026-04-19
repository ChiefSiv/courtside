import { proxyWithCache, bdlFetch, TTL, CORS_HEADERS } from './_cache.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  try {
    const result = await proxyWithCache({
      cacheKey:   'injuries:latest',
      ttlSeconds: TTL.injuries,
      fetcher:    () => bdlFetch('/player_injuries', { per_page: '100' }),
    });
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 503, headers: CORS_HEADERS, body: JSON.stringify({ error: String(err) }) };
  }
};