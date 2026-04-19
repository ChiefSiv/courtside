import { proxyWithCache, bdlFetch, TTL, CORS_HEADERS } from './_cache.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  const date = event.queryStringParameters?.date ?? new Date().toISOString().split('T')[0];
  try {
    const result = await proxyWithCache({
      cacheKey:   `schedule:${date}`,
      ttlSeconds: TTL.schedule,
      fetcher:    () => bdlFetch('/games', { 'dates[]': date, per_page: '30' }),
    });
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 503, headers: CORS_HEADERS, body: JSON.stringify({ error: String(err) }) };
  }
};