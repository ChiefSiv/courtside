// netlify/functions/_cache.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BDL_BASE = 'https://api.balldontlie.io/nba/v1';

export const TTL = {
  odds:      30,
  injuries:  60,
  lineups:   60,
  schedule:  3600,
  stats:     86400,
  defensive: 86400,
  player:    86400,
};

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type':                 'application/json',
};

async function getCached(cacheKey) {
  const { data } = await supabase
    .from('api_cache')
    .select('data, cached_at, expires_at')
    .eq('cache_key', cacheKey)
    .single();

  if (!data) return { data: null, isExpired: true, ageSeconds: 0, cachedAt: null };

  const now       = Date.now();
  const cachedMs  = new Date(data.cached_at).getTime();
  const expiresMs = new Date(data.expires_at).getTime();

  return {
    data:       data.data,
    isExpired:  now > expiresMs,
    ageSeconds: Math.floor((now - cachedMs) / 1000),
    cachedAt:   data.cached_at,
  };
}

async function setCached(cacheKey, data, ttlSeconds) {
  const now       = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const staleAt   = new Date(now.getTime() + ttlSeconds * 0.9 * 1000);

  await supabase.from('api_cache').upsert({
    cache_key:  cacheKey,
    data,
    cached_at:  now.toISOString(),
    expires_at: expiresAt.toISOString(),
    stale_at:   staleAt.toISOString(),
  });
}

export async function proxyWithCache({ cacheKey, ttlSeconds, fetcher }) {
  const cached = await getCached(cacheKey);

  if (cached.data !== null && !cached.isExpired) {
    return {
      data: cached.data,
      meta: { cachedAt: cached.cachedAt, ageSeconds: cached.ageSeconds, isStale: false, source: 'cache' },
    };
  }

  try {
    const liveData = await fetcher();
    await setCached(cacheKey, liveData, ttlSeconds);
    return {
      data: liveData,
      meta: { cachedAt: new Date().toISOString(), ageSeconds: 0, isStale: false, source: 'live' },
    };
  } catch (err) {
    if (cached.data !== null) {
      return {
        data: cached.data,
        meta: { cachedAt: cached.cachedAt, ageSeconds: cached.ageSeconds, isStale: true, source: 'cache' },
      };
    }
    throw err;
  }
}

export async function bdlFetch(path, params = {}) {
  const url = new URL(`${BDL_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

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