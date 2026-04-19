// src/algorithm/utils.js

export function bdlPropToStat(propType) {
  const map = {
    points: 'PTS',
    rebounds: 'REB',
    assists: 'AST',
    three_pointers_made: '3PM',
    steals: 'STL',
    blocks: 'BLK',
    turnovers: 'TOV',
    points_rebounds_assists: 'PRA',
    points_rebounds: 'PR',
    points_assists: 'PA',
    rebounds_assists: 'RA',
    double_double: 'DD',
  };
  return map[propType] ?? null;
}

export function getStatValue(stat, statType) {
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

export function getPlayerPosition(positionStr = '') {
  const p = positionStr.toUpperCase();
  if (p.includes('G')) return 'guard';
  if (p.includes('F')) return 'wing';
  if (p.includes('C')) return 'big';
  return 'wing';
}

export function getMinutesFromString(minStr) {
  if (!minStr) return 0;
  const parts = minStr.split(':');
  if (parts.length === 2) return parseInt(parts[0]) + parseInt(parts[1]) / 60;
  return parseFloat(minStr) || 0;
}

export function linearRegressionSlope(values) {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

// Sort stats most-recent-first, filter out entries with no game data or DNPs
export function mapPlayerStats(stats) {
  return [...stats]
    .filter(s => {
      if (!s?.game?.date) return false;
      // Exclude DNPs — player didn't play (0 or null minutes)
      const minStr = s.min ?? '';
      const mins = minStr.includes(':')
        ? parseInt(minStr.split(':')[0])
        : parseFloat(minStr) || 0;
      return mins > 0;
    })
    .sort(
      (a, b) => new Date(b.game.date).getTime() - new Date(a.game.date).getTime()
    );
}

export function seasonAvg(stats, statType) {
  if (!stats.length) return 0;
  const values = stats.map(s => getStatValue(s, statType));
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function daysBetweenGames(dateA, dateB) {
  return Math.abs(
    (new Date(dateA).getTime() - new Date(dateB).getTime()) / (1000 * 60 * 60 * 24)
  );
}

export function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}