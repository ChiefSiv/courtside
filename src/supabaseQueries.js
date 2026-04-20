// src/supabaseQueries.js
// Performance tracking reads/writes. Import supabase from your existing supabaseClient.js

import { supabase } from './supabaseClient.js';

// ---- Log top picks after algorithm run ----------------------
// Only logs top 3 straight, top 5 parlay legs, top 3 longshots per day.

export async function logTopPicks(straightBets, parlayLegs, longshots) {
  const today = new Date().toISOString().split('T')[0];
  const allPicks = [
    ...straightBets.slice(0, 3).map(p => buildPickRow(p, today)),
    ...parlayLegs.slice(0, 5).map(p => buildPickRow(p, today)),
    ...longshots.slice(0, 3).map(p => buildPickRow(p, today)),
  ];

  // Deduplicate by id — same player can appear in multiple sections
  const seen = new Set();
  const toLog = allPicks.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  if (!toLog.length) return;

  // Upsert — idempotent if called more than once per day
  const { error } = await supabase.from('bet_picks').upsert(toLog, { onConflict: 'id' });
  if (error) console.error('logTopPicks error:', error.message);
}

function buildPickRow(pick, today) {
  return {
    id:               pick.pickId,
    pick_date:        today,
    player_id:        pick.playerId,
    player_name:      pick.playerName,
    team:             pick.playerTeam,
    opponent:         pick.opponentTeam,
    game_id:          pick.gameId,
    section:          pick.section,
    stat:             pick.stat,
    line_value:       pick.lineValue,
    direction:        pick.direction,
    odds_at_pick:     pick.ev.direction === 'over' ? pick.bestBook.overOdds : pick.bestBook.underOdds,
    book:             pick.bestBook.vendor,
    ev_at_pick:       pick.ev.evPct,
    composite_score:  pick.composite.score,
    hit_rate_at_pick: pick.hitRate.pct,
    model_projection: pick.projection.finalProjection,
  };
}

// ---- Read: performance summary (24hr delayed) ---------------

export async function getPerformanceSummary(windowDays) {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);
  const sinceStr = since.toISOString().split('T')[0];

  const { data: outcomes, error } = await supabase
    .from('bet_outcomes')
    .select(`result, clv_pct, bet_picks(section, stat, book, odds_at_pick, pick_date)`)
    .gte('bet_picks.pick_date', sinceStr)
    .not('result', 'is', null);

  if (error) throw new Error(error.message);

  const rows = outcomes ?? [];
  let wins = 0, losses = 0, pushes = 0, totalReturn = 0, totalClv = 0, clvCount = 0;
  const bySection = {}, byStat = {}, byBook = {};

  for (const row of rows) {
    const pick    = row.bet_picks;
    if (!pick) continue;
    const odds    = pick.odds_at_pick;
    const payout  = oddsToDecimal(odds) - 1;

    if (!bySection[pick.section]) bySection[pick.section] = { wins: 0, losses: 0, totalReturn: 0 };
    if (!byStat[pick.stat])       byStat[pick.stat]       = { wins: 0, losses: 0, totalReturn: 0 };
    if (!byBook[pick.book])       byBook[pick.book]        = { totalReturn: 0, count: 0 };

    if (row.result === 'win') {
      wins++;
      totalReturn += payout;
      bySection[pick.section].wins++;
      bySection[pick.section].totalReturn += payout;
      byStat[pick.stat].wins++;
      byStat[pick.stat].totalReturn += payout;
      byBook[pick.book].totalReturn += payout;
    } else if (row.result === 'loss') {
      losses++;
      totalReturn -= 1;
      bySection[pick.section].losses++;
      bySection[pick.section].totalReturn -= 1;
      byStat[pick.stat].losses++;
      byStat[pick.stat].totalReturn -= 1;
      byBook[pick.book].totalReturn -= 1;
    } else if (row.result === 'push') {
      pushes++;
    }

    byBook[pick.book].count = (byBook[pick.book].count ?? 0) + 1;

    if (row.clv_pct != null) { totalClv += row.clv_pct; clvCount++; }
  }

  const total = wins + losses;

  return {
    windowDays,
    wins,
    losses,
    pushes,
    roi:         total > 0 ? parseFloat(((totalReturn / total) * 100).toFixed(1)) : 0,
    clv:         clvCount  > 0 ? parseFloat((totalClv / clvCount).toFixed(1)) : 0,
    bySection:   Object.fromEntries(Object.entries(bySection).map(([k, v]) => [k, { ...v, roi: roiOf(v) }])),
    byStat:      Object.fromEntries(Object.entries(byStat).map(([k, v])    => [k, { ...v, roi: roiOf(v) }])),
    bestSection: topByRoi(bySection),
    bestStat:    topByRoi(byStat),
    bestBook:    topByAvgReturn(byBook),
  };
}

// ---- Email signup -------------------------------------------

export async function logEmailSignup(email, source = 'best-bets') {
  const { error } = await supabase
    .from('email_signups')
    .upsert({ email, signup_source: source }, { onConflict: 'email' });
  if (error) throw new Error(error.message);
}

// ---- Helpers ------------------------------------------------

function oddsToDecimal(american) {
  return american > 0 ? american / 100 + 1 : 100 / Math.abs(american) + 1;
}

function roiOf(v) {
  const total = v.wins + v.losses;
  return total > 0 ? parseFloat(((v.totalReturn / total) * 100).toFixed(1)) : 0;
}

function topByRoi(map) {
  const entries = Object.entries(map);
  if (!entries.length) return null;
  return entries.sort(([, a], [, b]) => roiOf(b) - roiOf(a))[0][0];
}

function topByAvgReturn(map) {
  const entries = Object.entries(map);
  if (!entries.length) return null;
  return entries.sort(([, a], [, b]) => (b.totalReturn / b.count) - (a.totalReturn / a.count))[0][0];
}