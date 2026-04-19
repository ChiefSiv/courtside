// src/components/bestbets/MiniBarChart.jsx
// Matches existing CourtSide chart style:
// - Light blue bars (#93c5fd), hit = #3b82f6, miss = #93c5fd
// - Dashed red reference line for the prop line
// - No axes labels (too small), tooltips on hover

import {
  BarChart, Bar, ReferenceLine, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 6,
      padding: '4px 8px',
      fontSize: '0.75rem',
      color: '#111827',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    }}>
      <div style={{ fontWeight: 700 }}>{d.statValue} {d.opponent && `vs ${d.opponent}`}</div>
      <div style={{ color: d.hitLine ? '#16a34a' : '#dc2626' }}>
        {d.hitLine ? '✓ Hit' : '✗ Miss'}
      </div>
    </div>
  );
}

/**
 * MiniBarChart
 * @param {{ games: Array, line: number }} props
 *   games - last 15 game results from calculateHitRate
 *   line  - the prop line value (shown as dashed reference)
 */
export function MiniBarChart({ games = [], line }) {
  if (!games.length) return <div className="bb-mini-chart" />;

  // Show most recent on the right: reverse so oldest is left
  const data = [...games].reverse();

  return (
    <div className="bb-mini-chart">
      <ResponsiveContainer width="100%" height={54}>
        <BarChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }} barSize={6} barGap={1}>
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59,130,246,0.08)' }} />
          {line != null && (
            <ReferenceLine
              y={line}
              stroke="#ef4444"
              strokeDasharray="3 3"
              strokeWidth={1.5}
            />
          )}
          <Bar dataKey="statValue" radius={[2, 2, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.hitLine ? '#3b82f6' : '#93c5fd'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}