import { proxyWithCache, bdlFetch, TTL, CORS_HEADERS } from './_cache.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  const season = event.queryStringParameters?.season ?? '2025';
  try {
    const result = await proxyWithCache({
      cacheKey:   `defensive:${season}`,
      ttlSeconds: TTL.defensive,
      fetcher:    () => bdlFetch('/team_stats', { season, per_page: '30' }),
    });
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 503, headers: CORS_HEADERS, body: JSON.stringify({ error: String(err) }) };
  }
};