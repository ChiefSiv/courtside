import { createClient } from '@supabase/supabase-js';
import { bdlFetch } from './_cache.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PROP_TO_STAT = {
  points: 'PTS', rebounds: 'REB', assists: 'AST',
  three_pointers_made: '3PM', steals: 'STL', blocks: 'BLK', turnovers: 'TOV',
};

export const handler = async () => {
  const today = new Date().toISOString().split('T')[0];
  const nowMs = Date.now();

  try {
    const games = await bdlFetch('/games', { 'dates[]': today, per_page: '30' });

    const soonGames = games.filter(g => {
      if (!g.status || g.status === 'Final') return false;
      const tipMs = new Date(`${g.date}T${g.time ?? '00:00:00'}`).getTime();
      const minsUntil = (tipMs - nowMs) / 60000;
      return minsUntil >= 4 && minsUntil <= 10;
    });

    if (!soonGames.length) return { statusCode: 200, body: JSON.stringify({ message: 'No games tipping soon' }) };

    const gameIds = soonGames.map(g => g.id);
    const allOdds = await bdlFetch('/odds', { date: today, per_page: '200' });
    const relevantOdds = allOdds.filter(o => gameIds.includes(o.game_id));

    const { data: picks } = await supabase
      .from('bet_picks')
      .select('id, player_id, stat, direction, game_id, odds_at_pick')
      .in('game_id', gameIds);

    if (!picks?.length) return { statusCode: 200, body: JSON.stringify({ message: 'No picks to capture' }) };

    const inserts = [];

    for (const pick of picks) {
      const { data: existing } = await supabase
        .from('closing_lines').select('id').eq('pick_id', pick.id).single();
      if (existing) continue;

      const matchOdds = relevantOdds.find(
        o => o.player_id === pick.player_id &&
             PROP_TO_STAT[o.prop_type] === pick.stat &&
             o.market.type === 'over_under'
      );
      if (!matchOdds) continue;

      const closingOdds = pick.direction === 'over'
        ? matchOdds.market.over_odds
        : matchOdds.market.under_odds;

      inserts.push({
        pick_id:      pick.id,
        closing_line: parseFloat(matchOdds.line_value),
        closing_odds: closingOdds,
        captured_at:  new Date().toISOString(),
      });
    }

    if (inserts.length) await supabase.from('closing_lines').insert(inserts);

    return { statusCode: 200, body: JSON.stringify({ captured: inserts.length }) };
  } catch (err) {
    console.error('capture-closing-lines error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};