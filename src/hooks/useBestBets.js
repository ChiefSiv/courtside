// src/hooks/useBestBets.js
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchOdds,
  fetchInjuries,
  fetchSchedule,
  fetchDefensiveStats,
  fetchPlayerStats,
} from '../api.js';
import { runAlgorithmPipeline } from '../algorithm/index.js';
import { chunkArray } from '../algorithm/utils.js';

const TODAY = new Date().toISOString().split('T')[0];

export function useOdds() {
  return useQuery({
    queryKey:              ['odds', TODAY],
    queryFn:               () => fetchOdds(TODAY),
    staleTime:             5 * 60_000,
    refetchInterval:       10 * 60_000,
    refetchIntervalInBackground: false,
    retry: 2,
  });
}

export function useInjuries() {
  return useQuery({
    queryKey:              ['injuries'],
    queryFn:               fetchInjuries,
    staleTime:             10 * 60_000,
    refetchInterval:       15 * 60_000,
    refetchIntervalInBackground: false,
    retry: 2,
  });
}

export function useSchedule() {
  return useQuery({
    queryKey:        ['schedule', TODAY],
    queryFn:         () => fetchSchedule(TODAY),
    staleTime:       55 * 60_000,
    refetchInterval: 5  * 60_000,
    retry: 2,
  });
}

export function useDefensiveStats() {
  return useQuery({
    queryKey:        ['defensiveStats'],
    queryFn:         fetchDefensiveStats,
    staleTime:       23 * 60 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 2,
  });
}

function useBatchPlayerStats(playerIds) {
  return useQuery({
    queryKey: ['batchPlayerStats', playerIds.join(',')],
    queryFn: async () => {
      if (!playerIds.length) return {};
      const results = {};
      const chunks  = chunkArray(playerIds, 10);
      for (const chunk of chunks) {
        await Promise.all(
          chunk.map(async (pid) => {
            try {
              const res    = await fetchPlayerStats(pid);
              results[pid] = res.data ?? [];
            } catch {
              results[pid] = [];
            }
          })
        );
      }
      return results;
    },
    enabled:         playerIds.length > 0,
    staleTime:       23 * 60 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 2,
  });
}

export function getStaleBanner(response) {
  if (!response?.meta) return { isStale: false, ageSeconds: 0, label: '' };
  const { isStale, ageSeconds } = response.meta;
  let label = '';
  if (ageSeconds < 60)        label = `${ageSeconds}s ago`;
  else if (ageSeconds < 3600) label = `${Math.floor(ageSeconds / 60)} min ago`;
  else                        label = `${Math.floor(ageSeconds / 3600)}h ago`;
  return { isStale, ageSeconds, label };
}

export function useBestBets(filters, settings) {
  const oddsQuery      = useOdds();
  const injuriesQuery  = useInjuries();
  const scheduleQuery  = useSchedule();
  const defensiveQuery = useDefensiveStats();

  const playerIds = useMemo(() => {
    if (!oddsQuery.data?.data) return [];
    return [...new Set(oddsQuery.data.data.map(o => o.player_id))];
  }, [oddsQuery.data]);

  const statsQuery = useBatchPlayerStats(playerIds);

  const isLoading =
    oddsQuery.isLoading      ||
    injuriesQuery.isLoading  ||
    scheduleQuery.isLoading  ||
    defensiveQuery.isLoading ||
    (playerIds.length > 0 && statsQuery.isLoading);

  const errors = [
    oddsQuery.isError      && 'Failed to load odds',
    injuriesQuery.isError  && 'Failed to load injury report',
    scheduleQuery.isError  && 'Failed to load schedule',
    defensiveQuery.isError && 'Failed to load defensive stats',
  ].filter(Boolean);

  const hasGamesToday = (scheduleQuery.data?.data?.length ?? 0) > 0;

  const staleBanner = useMemo(() => {
    const a = getStaleBanner(oddsQuery.data);
    const b = getStaleBanner(injuriesQuery.data);
    return a.ageSeconds >= b.ageSeconds ? a : b;
  }, [oddsQuery.data, injuriesQuery.data]);

  const { straightBets, parlayLegs, longshots, featuredParlay } = useMemo(() => {
    const empty = { straightBets: [], parlayLegs: [], longshots: [], featuredParlay: null };

    if (
      isLoading                  ||
      !oddsQuery.data?.data      ||
      !injuriesQuery.data?.data  ||
      !scheduleQuery.data?.data  ||
      !defensiveQuery.data?.data ||
      !statsQuery.data
    ) return empty;

    try {
      return runAlgorithmPipeline({
        odds:           oddsQuery.data.data,
        injuries:       injuriesQuery.data.data,
        games:          scheduleQuery.data.data,
        defensiveStats: defensiveQuery.data.data,
        playerStats:    statsQuery.data,
        filters,
        settings,
      });
    } catch (err) {
      console.error('Algorithm pipeline error:', err);
      return empty;
    }
  }, [
    isLoading,
    oddsQuery.data,
    injuriesQuery.data,
    scheduleQuery.data,
    defensiveQuery.data,
    statsQuery.data,
    filters,
    settings,
  ]);

  return {
    straightBets,
    parlayLegs,
    longshots,
    featuredParlay,
    isLoading,
    hasGamesToday,
    staleBanner,
    errors,
  };
}