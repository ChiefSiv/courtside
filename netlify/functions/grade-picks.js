import { createClient } from '@supabase/supabase-js';
import { bdlFetch } from './_cache.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getStatFromBoxScore(stat, statType) {
  switch (statType) {
    case 'PTS': return stat.pts;
    case 'REB': return stat.reb;
    case 'AST': return stat.ast;
    case '3PM': return stat.fg3m;
    case 'STL': return stat.stl;
    case 'BLK': return stat.blk;
    case 'TOV': return stat.turnover;
    case 'PRA': return stat.pts + stat.reb + stat.ast;
    case 'PR':  return stat.pts + stat.reb;
    case 'PA':  return stat.pts + stat.ast;
    case 'RA':  return stat.reb + stat.ast;
    case 'DD': {
      const cats = [stat.pts, stat.reb, stat.ast, stat.stl, stat.blk].filter(v => v >= 10);
      return cats.length >= 2 ? 1 : 0;
    }
    default: return 0;
  }
}

function oddsToDecimal(american) {
  return american > 0 ? american / 100 + 1 : 100 / Math.abs(american) + 1;
}

export const handler = async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  try {
    const { data: picks, error } = await supabase
      .from('bet_picks')
      .select('id, player_id, game_id, stat, direction, line_value, odds_at_pick')
      .eq('pick_date', yesterdayStr);

    if (error || !picks?.length) return { statusCode: 200, body: JSON.stringify({ message: 'Nothing to grade' }) };

    const pickIds = picks.map(p => p.id);
    const { data: existingOutcomes } = await supabase
      .from('bet_outcomes').select('pick_id').in('pick_id', pickIds);

    const gradedIds = new Set((existingOutcomes ?? []).map(o => o.pick_id));
    const ungraded  = picks.filter(p => !gradedIds.has(p.id));

    if (!ungraded.length) return { statusCode: 200, body: JSON.stringify({ message: 'All picks already graded' }) };

    const boxScores = await bdlFetch('/stats', { 'dates[]': yesterdayStr, per_page: '200' });
    const outcomes  = [];

    for (const pick of ungraded) {
      const playerStat = boxScores.find(
        s => s.player.id === pick.player_id && s.game.id === pick.game_id
      );

      if (!playerStat) {
        outcomes.push({ pick_id: pick.id, actual_stat: null, result: 'void', clv_pct: null, graded_at: new Date().toISOString() });
        continue;
      }

      const actualStat = getStatFromBoxScore(playerStat, pick.stat);
      let result;
      if (actualStat === pick.line_value)       result = 'push';
      else if (pick.direction === 'over')        result = actualStat > pick.line_value ? 'win' : 'loss';
      else                                       result = actualStat < pick.line_value ? 'win' : 'loss';

      const { data: closingLine } = await supabase
        .from('closing_lines').select('closing_odds').eq('pick_id', pick.id).single();

      let clvPct = null;
      if (closingLine) {
        const openDec  = oddsToDecimal(pick.odds_at_pick);
        const closeDec = oddsToDecimal(closingLine.closing_odds);
        clvPct = parseFloat((((openDec - closeDec) / closeDec) * 100).toFixed(2));
      }

      outcomes.push({ pick_id: pick.id, actual_stat: actualStat, result, clv_pct: clvPct, graded_at: new Date().toISOString() });
    }

    if (outcomes.length) await supabase.from('bet_outcomes').insert(outcomes);

    return { statusCode: 200, body: JSON.stringify({ graded: outcomes.length }) };
  } catch (err) {
    console.error('grade-picks error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};