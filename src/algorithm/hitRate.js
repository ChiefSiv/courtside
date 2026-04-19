// src/algorithm/hitRate.js
import { getStatValue, mapPlayerStats } from './utils.js';

export function calculateHitRate(stats, statType, line, lastN = 15, teamAbbrMap = null) {
  const sorted = mapPlayerStats(stats).slice(0, lastN);

  const games = sorted
    .filter(s => {
      if (!s.game || !s.team) return false;
      const mins = s.min ? (s.min.includes(':') ? parseInt(s.min.split(':')[0]) : parseFloat(s.min)) : 0;
      return mins > 0;
    })
    .map(s => {
      const statValue = getStatValue(s, statType);
      const g = s.game;

      const homeTeamId    = g.home_team?.id    ?? g.home_team_id    ?? null;
      const visitorTeamId = g.visitor_team?.id ?? g.visitor_team_id ?? null;

      const homeAbbr    = g.home_team?.abbreviation    ?? (teamAbbrMap?.get(homeTeamId))    ?? null;
      const visitorAbbr = g.visitor_team?.abbreviation ?? (teamAbbrMap?.get(visitorTeamId)) ?? null;

      const homeScore    = g.home_team_score    ?? 0;
      const visitorScore = g.visitor_team_score ?? 0;

      const isHome   = homeTeamId != null && s.team.id === homeTeamId;
      const opponent = isHome ? (visitorAbbr ?? 'OPP') : (homeAbbr ?? 'OPP');
      const won      = isHome ? homeScore > visitorScore : visitorScore > homeScore;

      return {
        gameId:    g.id,
        date:      g.date,
        opponent,
        statValue,
        hitLine:   statValue > line,   // true = went over
        gameResult: won ? 'W' : 'L',
      };
    });

  const total     = games.length;
  const overHits  = games.filter(g => g.hitLine).length;
  const underHits = total - overHits;

  return {
    // Legacy flat fields (used by display)
    hits:  overHits,
    total,
    pct:   total > 0 ? Math.round((overHits / total) * 100) : 0,
    games,
    // Directional sub-objects (used by filters)
    over: {
      hits: overHits,
      pct:  total > 0 ? Math.round((overHits  / total) * 100) : 0,
    },
    under: {
      hits: underHits,
      pct:  total > 0 ? Math.round((underHits / total) * 100) : 0,
    },
  };
}