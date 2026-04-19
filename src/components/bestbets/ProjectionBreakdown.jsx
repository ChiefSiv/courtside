// src/components/bestbets/ProjectionBreakdown.jsx

/**
 * ProjectionBreakdown
 * Shows the full multiplier table in the expanded card view.
 * Matches spec layout exactly.
 */
export function ProjectionBreakdown({ projection, ev, line, stat }) {
  if (!projection) return null;

  const { baseline, adjustments, finalProjection, usageShift, confidence } = projection;

  return (
    <div className="bb-proj-breakdown">
      <div className="bb-proj-title">Projection Breakdown</div>
      <table className="bb-proj-table">
        <tbody>
          <tr>
            <td>Baseline (season avg)</td>
            <td style={{ textAlign: 'right', fontWeight: 600, color: '#111827' }}>
              {baseline}
            </td>
          </tr>

          {adjustments.map((adj, i) => (
            <tr key={i} className={`bb-proj-row-${adj.color}`}>
              <td style={{ paddingLeft: 8, color: '#6b7280', fontSize: '0.78rem' }}>
                × {adj.label}
              </td>
              <td>
                <span style={{ marginRight: 6, color: '#9ca3af', fontSize: '0.75rem' }}>
                  ×{adj.multiplier.toFixed(2)}
                </span>
                <span>
                  {adj.delta > 0 ? `+${adj.delta.toFixed(1)}` : adj.delta.toFixed(1)}
                </span>
              </td>
            </tr>
          ))}

          <tr className="bb-proj-row-total">
            <td>= Projection</td>
            <td style={{ textAlign: 'right' }}>
              <strong>{finalProjection} {stat}</strong>
            </td>
          </tr>

          <tr>
            <td style={{ color: '#6b7280', fontSize: '0.78rem' }}>Line</td>
            <td style={{ textAlign: 'right', color: '#374151' }}>{line}</td>
          </tr>

          <tr>
            <td style={{ color: '#6b7280', fontSize: '0.78rem' }}>
              Model prob ({ev.direction})
            </td>
            <td style={{ textAlign: 'right', color: '#374151' }}>
              {Math.round((ev.direction === 'over' ? ev.modelProb : 1 - ev.modelProb) * 100)}%
            </td>
          </tr>

          <tr>
            <td style={{ color: '#6b7280', fontSize: '0.78rem' }}>
              Book implied prob (after vig)
            </td>
            <td style={{ textAlign: 'right', color: '#374151' }}>
              {Math.round(ev.bookImpliedProb * 100)}%
            </td>
          </tr>

          <tr>
            <td style={{ fontWeight: 700, color: '#111827', paddingTop: 6 }}>EV%</td>
            <td style={{
              textAlign: 'right',
              fontWeight: 800,
              color: ev.evPct >= 5 ? '#15803d' : ev.evPct > 0 ? '#16a34a' : '#6b7280',
              paddingTop: 6,
            }}>
              {ev.evPct > 0 ? '+' : ''}{ev.evPct.toFixed(1)}%
            </td>
          </tr>
        </tbody>
      </table>

      {confidence !== 'high' && (
        <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 6 }}>
          ⓘ Projection confidence: {confidence}
          {confidence === 'low' && ' — limited sample size'}
        </div>
      )}

      {usageShift && (
        <div style={{
          marginTop: 8,
          fontSize: '0.75rem',
          background: '#f0fdf4',
          border: '1px solid #86efac',
          borderRadius: 5,
          padding: '6px 10px',
          color: '#15803d',
        }}>
          {usageShift.label}
        </div>
      )}
    </div>
  );
}