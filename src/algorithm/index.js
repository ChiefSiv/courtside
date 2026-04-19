// src/algorithm/index.js
// Full pipeline: raw BDL data → computed Pick objects

import { v4 as uuidv4 } from 'uuid';
import { bdlPropToStat, getPlayerPosition } from './utils.js';
import { calculateHitRate }          from './hitRate.js';
import { evaluateMatchup }           from './matchup.js';
import { evaluateForm }              from './form.js';
import { checkAvailability }         from './availability.js';
import { getProjection }             from './projection.js';
import { getProjectionProbability }  from './probability.js';
import { calculateEV } from './ev.js';
import { calculateCompositeScore }   from './composite.js';
import { applySectionFilters, rankBySection } from './filters.js';
import { generateReasoningText }     from './reasoning.js';
import { selectFeaturedParlay }      from './parlay.js';
import { getLineMovement }           from './lineMovement.js';

const COMBO_STATS = new Set(['PRA', 'PR', 'PA', 'RA', 'DD']);

// ---- Helpers ------------------------------------------------

function groupOddsByPlayerProp(odds, preferredBooks) {
  const map = new Map();
  for (const o of odds) {
    if (!preferredBooks.includes(o.vendor)) continue;

    // Accept over_under markets normally
    if (o.market.type === 'over_under') {
      const key = `${o.player_id}:${o.prop_type}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({
        vendor:      o.vendor,
        overOdds:    o.market.over_odds,
        underOdds:   o.market.under_odds,
        lineValue:   parseFloat(o.line_value),
        updatedAt:   o.updated_at,
        gameId:      o.game_id,
        marketType:  'over_under',
      });
      continue;
    }

    // Accept milestone markets: treat as "over X" (player scores AT LEAST X)
    // Negative odds (-120 or worse) = parlay leg candidates
    // Positive odds (+500 to +2500) = longshot candidates
    const milestoneOdds = o.market.odds;
    const isUsableMilestone = o.market.type === 'milestone' && milestoneOdds != null &&
      (milestoneOdds <= -120 || (milestoneOdds >= 500 && milestoneOdds <= 2500));
    if (isUsableMilestone) {
      const key = `${o.player_id}:${o.prop_type}:milestone:${o.line_value}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({
        vendor:      o.vendor,
        overOdds:    o.market.odds,   // milestone = "over" direction only
        underOdds:   null,
        lineValue:   parseFloat(o.line_value),
        updatedAt:   o.updated_at,
        gameId:      o.game_id,
        marketType:  'milestone',
        isMilestone: true,
      });
    }
  }
  return map;
}

function getPlayerName(stats) {
  const p = stats[0]?.player;
  return p ? `${p.first_name} ${p.last_name}` : 'Unknown';
}

function getPlayerTeamAbbr(stats) {
  return stats[0]?.team?.abbreviation ?? null;
}

function getOpponent(game, playerTeamAbbr) {
  return game.home_team.abbreviation === playerTeamAbbr
    ? game.visitor_team.abbreviation
    : game.home_team.abbreviation;
}

function getOpponentTeamId(game, playerTeamAbbr) {
  return game.home_team.abbreviation === playerTeamAbbr
    ? game.visitor_team.id
    : game.home_team.id;
}

function getPlayerTeamId(stats) {
  return stats[0]?.team?.id ?? null;
}

function findBestPriceAlert(allOdds, playerId, propType, currentBestBook, direction, selectedBooks) {
  const all = allOdds.filter(o => o.player_id === playerId && o.prop_type === propType && o.market.type === 'over_under');
  for (const o of all) {
    if (selectedBooks.includes(o.vendor)) continue;
    const theirOdds = direction === 'over' ? o.market.over_odds : o.market.under_odds;
    const ourOdds   = direction === 'over' ? currentBestBook.overOdds : currentBestBook.underOdds;
    if (theirOdds - ourOdds >= 10) {
      return { vendor: o.vendor, odds: theirOdds, direction, priceDelta: theirOdds - ourOdds };
    }
  }
  return null;
}

// ---- Main pipeline ------------------------------------------

/**
 * runAlgorithmPipeline
 *
 * @param {{
 *   odds: Array,
 *   injuries: Array,
 *   games: Array,
 *   defensiveStats: Array,
 *   playerStats: Object,   // { [playerId]: BDLPlayerStat[] }
 *   filters: Object,
 *   settings: Object,
 * }} input
 * @returns {{ straightBets, parlayLegs, longshots, featuredParlay }}
 */
export function runAlgorithmPipeline({ odds, injuries, games, defensiveStats, playerStats, filters, settings }) {
  const now = new Date().toISOString();

  // Index data
  const injuryMap    = new Map(injuries.map(i => [i.player_id, i]));
  const gameMap      = new Map(games.map(g => [String(g.id), g]));
  const defensiveMap = new Map(defensiveStats.map(d => [d.team.id, d]));

  // Team ID → abbreviation map (from schedule + defensive stats)
  const teamAbbrMap = new Map();
  for (const g of games) {
    if (g.home_team?.id    && g.home_team?.abbreviation)    teamAbbrMap.set(g.home_team.id,    g.home_team.abbreviation);
    if (g.visitor_team?.id && g.visitor_team?.abbreviation) teamAbbrMap.set(g.visitor_team.id, g.visitor_team.abbreviation);
  }
  for (const d of defensiveStats) {
    if (d.team?.id && d.team?.abbreviation) teamAbbrMap.set(d.team.id, d.team.abbreviation);
  }

  const oddsGroups = groupOddsByPlayerProp(odds, settings.preferredBooks);
  const picks = [];

  for (const [groupKey, bookOddsList] of oddsGroups.entries()) {
    const [playerIdStr, propType] = groupKey.split(':');
    const playerId = parseInt(playerIdStr);

    const statType = bdlPropToStat(propType);
    if (!statType) continue;

    // Skip combo stats with no BDL market
    if (COMBO_STATS.has(statType) && !bookOddsList.length) continue;
    if (!bookOddsList.length) continue;

    const gameId = bookOddsList[0].gameId;
    const game   = gameMap.get(String(gameId));
    if (!game) continue;

    const stats = playerStats[playerId] ?? [];
    if (!stats.length) continue;

    const teamAbbr   = getPlayerTeamAbbr(stats);
    const position   = getPlayerPosition(stats[0]?.player?.position ?? '');
    const injury     = injuryMap.get(playerId);

    // Team/stat filters
    if (filters.excludeTeams?.includes(teamAbbr)) continue;
    if (filters.statTypes?.length && !filters.statTypes.includes(statType)) continue;

    // --- Availability gate ---
    const availability = checkAvailability({ injury, playerStats: stats });
    if (!availability.passes) continue;

    // --- Best book (tightest over odds = closest to even) ---
    // For milestones: pick highest (least negative) odds = best value
    const bestBook = bookOddsList.reduce((best, b) => {
      const bOdds    = b.overOdds    ?? -9999;
      const bestOdds = best.overOdds ?? -9999;
      // For negative odds, higher (less negative) = better payout
      // For milestone vs over_under, prefer over_under lines if available
      if (best.marketType === 'over_under' && b.marketType === 'milestone') return best;
      if (b.marketType === 'over_under' && best.marketType === 'milestone') return b;
      return bOdds > bestOdds ? b : best;
    });
    const lineValue = bestBook.lineValue;

    // Odds range filter
    const checkOdds = bestBook.overOdds;
    if (filters.oddsMin != null && checkOdds < filters.oddsMin) continue;
    if (filters.oddsMax != null && checkOdds > filters.oddsMax) continue;

    // --- Hit rate ---
    const hitRate = calculateHitRate(stats, statType, lineValue, 15, teamAbbrMap);

    // --- Matchup ---
    const opponentTeamId  = getOpponentTeamId(game, teamAbbr);
    const opponentDefStats = defensiveMap.get(opponentTeamId);
    const matchup = evaluateMatchup({ statType, position, opponentDefStats, allDefensiveStats: defensiveStats });

    // --- Form (placeholder — recomputed after EV direction is known) ---
    const form = evaluateForm({ stats, statType, lineValue, direction: 'over' });

    // --- Projection ---
    // Derive matchup multiplier from opponentAllowsPct
    const matchupMultiplier = matchup.qualifies
      ? 1 + (matchup.opponentAllowsPct / 100) * 0.5
      : 1.0;

    // Teammate injuries (same team, confirmed OUT, not this player)
    const playerTeamId = getPlayerTeamId(stats);
    const teammateInjuries = injuries.filter(i =>
      i.status === 'OUT' &&
      i.player_id !== playerId &&
      playerStats[i.player_id]?.[0]?.team?.id === playerTeamId
    );

    const projection = getProjection({
      stats,
      statType,
      game,
      matchupMultiplier,
      injuries: teammateInjuries,
      playerStats,
    });

    // --- Probability ---
    const probability = getProjectionProbability(projection.finalProjection, stats, statType, lineValue);

    // --- EV for over and under, pick best ---
    // Pass explicit direction so ev.direction always reflects which side was calculated
    const overEV  = calculateEV(probability.pOver,  bestBook.overOdds,  'over');
    const underEV = bestBook.underOdds != null
      ? calculateEV(probability.pUnder, bestBook.underOdds, 'under')
      : { ev: -9.99, evPct: -999, direction: 'under', modelProb: 0, bookImpliedProb: 1 };
    const ev = overEV.evPct >= underEV.evPct ? overEV : underEV;

    // Recompute form now that we know the actual direction
    const formDirectional = evaluateForm({ stats, statType, lineValue, direction: ev.direction });
    // Replace placeholder form with direction-aware version
    Object.assign(form, formDirectional);

    // Min EV filter
    if (filters.minEV != null && ev.evPct < filters.minEV) continue;

    // --- Composite score ---
    const composite = calculateCompositeScore({
      evPct:          ev.evPct,
      hitRate:        hitRate.pct,
      matchupStrength: matchup.strength,
      formStrength:   form.strength,
    });

    // --- Reasoning ---
    const reasoningText = generateReasoningText({
      statType,
      lineValue,
      direction: ev.direction,
      form,
      matchup,
      projection,
      availability,
    });

    // --- Line movement ---
    const lineMovement = getLineMovement(statType, playerId, lineValue, odds);

    // --- Best price alert (non-selected books) ---
    // Only meaningful when user has multiple books selected
    const bestPriceAlert = settings.preferredBooks.length > 1
      ? findBestPriceAlert(odds, playerId, propType, bestBook, ev.direction, settings.preferredBooks)
      : null;

    const opponentTeam = getOpponent(game, teamAbbr);

    picks.push({
      pickId:           uuidv4(),
      playerId,
      playerName:       getPlayerName(stats),
      playerTeam:       teamAbbr ?? '',
      playerPosition:   position,
      playerHeadshot:   null,
      opponentTeam,
      gameId,
      gameTime:         game.date,
      gameTotal:        game.over_under ?? null,
      spread:           game.spread ?? null,
      stat:             statType,
      direction:        ev.direction,
      lineValue,
      bookOdds:         bookOddsList,
      bestBook,
      bestPriceAlert,
      ev,
      hitRate,
      matchup,
      form,
      projection,
      probability,
      composite,
      reasoningText,
      lineMovement,
      section:          'straight', // overwritten by applySectionFilters
      isStretchPick:    false,
      generatedAt:      now,
      oddsLastUpdated:  bestBook.updatedAt,
      isStale:          false,
      staleReason:      null,
      availability,
    });
  }

  // Section assignment + ranking
  const { straight, leg, longshot } = applySectionFilters(picks);
  const straightBets = rankBySection(straight);
  const parlayLegs   = rankBySection(leg);
  const longshots    = rankBySection(longshot);
  const featuredParlay = selectFeaturedParlay(parlayLegs);

  return { straightBets, parlayLegs, longshots, featuredParlay };
}