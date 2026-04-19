// src/components/bestbets/PerformanceSummaryWidget.jsx

import { useState, useEffect } from 'react';
import { getPerformanceSummary } from '../../supabaseQueries.js';

export function PerformanceSummaryWidget() {
  const [perf, setPerf]     = useState(null);
  const [window, setWindow] = useState(30);

  useEffect(() => {
    getPerformanceSummary(window)
      .then(setPerf)
      .catch(() => setPerf(null));
  }, [window]);

  if (!perf) return null;

  const wl  = `${perf.wins}-${perf.losses}`;
  const roi = perf.roi > 0 ? `+${perf.roi}%` : `${perf.roi}%`;
  const clv = perf.clv  > 0 ? `+${perf.clv}%`  : `${perf.clv}%`;

  return (
    <div className="bb-perf-strip">
      <span>
        Last{' '}
        {[7, 30, 90].map(d => (
          <button
            key={d}
            onClick={() => setWindow(d)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontWeight: window === d ? 700 : 400,
              color: window === d ? '#0369a1' : '#7cb9d8',
              padding: '0 3px',
              fontSize: '0.82rem',
            }}
          >
            {d}d
          </button>
        ))}
      </span>
      <span className="perf-divider">|</span>
      <span>W/L: <strong>{wl}</strong></span>
      <span className="perf-divider">|</span>
      <span>ROI: <strong style={{ color: perf.roi >= 0 ? '#0369a1' : '#dc2626' }}>{roi}</strong></span>
      <span className="perf-divider">|</span>
      <span>CLV: <strong>{clv}</strong></span>
      <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#7cb9d8' }}>
        Beta — tracking in progress
      </span>
    </div>
  );
}