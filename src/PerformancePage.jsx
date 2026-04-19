// src/PerformancePage.jsx

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { getPerformanceSummary } from './supabaseQueries.js';

const WINDOWS = [7, 30, 90, 365];
const WINDOW_LABELS = { 7: '7 days', 30: '30 days', 90: '90 days', 365: 'YTD' };

const SECTION_LABELS = {
  straight: 'Straight Bets',
  leg:      'Parlay Legs',
  longshot: 'Longshots',
};

function StatBox({ label, value, sub, color }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 20px', minWidth: 120 }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: color ?? '#111827', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SectionBreakdown({ bySection }) {
  if (!bySection) return null;
  const rows = Object.entries(bySection).filter(([, v]) => v.wins + v.losses > 0);
  if (!rows.length) return null;

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        By Section
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr>
            {['Section', 'W', 'L', 'ROI'].map(h => (
              <th key={h} style={{ textAlign: 'left', fontWeight: 600, color: '#9ca3af', fontSize: '0.72rem', textTransform: 'uppercase', paddingBottom: 8, borderBottom: '1px solid #f3f4f6' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([section, v]) => (
            <tr key={section}>
              <td style={{ padding: '7px 0', color: '#374151', fontWeight: 500 }}>{SECTION_LABELS[section] ?? section}</td>
              <td style={{ color: '#16a34a', fontWeight: 600 }}>{v.wins}</td>
              <td style={{ color: '#dc2626', fontWeight: 600 }}>{v.losses}</td>
              <td style={{ color: v.roi >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                {v.roi >= 0 ? '+' : ''}{v.roi}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatBreakdown({ byStat }) {
  if (!byStat) return null;
  const rows = Object.entries(byStat)
    .filter(([, v]) => v.wins + v.losses > 0)
    .sort(([, a], [, b]) => b.roi - a.roi);
  if (!rows.length) return null;

  const chartData = rows.map(([stat, v]) => ({ stat, roi: v.roi, wl: `${v.wins}-${v.losses}` }));

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        ROI by Stat Type
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={24}>
          <XAxis dataKey="stat" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
          <Tooltip
            formatter={(v) => [`${v >= 0 ? '+' : ''}${v}%`, 'ROI']}
            contentStyle={{ fontSize: '0.78rem', borderRadius: 6, border: '1px solid #e5e7eb' }}
          />
          <Bar dataKey="roi" radius={[3, 3, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.roi >= 0 ? '#3b82f6' : '#fca5a5'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function InsightsWidget({ perf }) {
  if (!perf?.bestStat && !perf?.bestSection && !perf?.bestBook) return null;
  return (
    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0369a1', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Algorithm Insights — Last 30 Days
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: '0.82rem', color: '#374151' }}>
        {perf.bestStat && (
          <span>🏆 Best stat: <strong style={{ color: '#0369a1' }}>{perf.bestStat}</strong></span>
        )}
        {perf.bestSection && (
          <span>📈 Best section: <strong style={{ color: '#0369a1' }}>{SECTION_LABELS[perf.bestSection] ?? perf.bestSection}</strong></span>
        )}
        {perf.bestBook && (
          // fixed: merged both style props into one
          <span>📚 Best book by avg EV: <strong style={{ color: '#0369a1', textTransform: 'capitalize' }}>{perf.bestBook}</strong></span>
        )}
      </div>
    </div>
  );
}

export function PerformancePage() {
  const [windowDays, setWindowDays] = useState(30);
  const [perf,       setPerf]       = useState(null);
  const [perf30,     setPerf30]     = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  // Single fetch function — avoids synchronous setState in effect body
  const fetchWindow = useCallback(async (days) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPerformanceSummary(days);
      setPerf(result);
      // If we just fetched 30 days, also store it for the insights widget
      if (days === 30) setPerf30(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch selected window on mount and whenever windowDays changes
  useEffect(() => {
    fetchWindow(windowDays);
  }, [windowDays, fetchWindow]);

  // Fetch 30-day data for insights widget when a non-30 window is selected
  useEffect(() => {
    if (windowDays !== 30 && !perf30) {
      getPerformanceSummary(30)
        .then(setPerf30)
        .catch((e) => { void e; });
    }
  }, [windowDays, perf30]);

  const total = perf ? perf.wins + perf.losses : 0;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 64px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: 0 }}>Track Record</h1>
          <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 2 }}>
            Beta — tracking since launch · Results delayed 24 hours · Top picks only
          </div>
        </div>
        <a href="#bestBets" style={{ fontSize: '0.82rem', color: '#3b82f6', textDecoration: 'none' }}>
          ← Back to Best Bets
        </a>
      </div>

      {/* Window selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {WINDOWS.map(w => (
          <button
            key={w}
            onClick={() => setWindowDays(w)}
            style={{
              padding: '5px 14px',
              borderRadius: 6,
              border: '1px solid',
              borderColor: windowDays === w ? '#3b82f6' : '#e5e7eb',
              background: windowDays === w ? '#eff6ff' : '#fff',
              color: windowDays === w ? '#2563eb' : '#374151',
              fontWeight: windowDays === w ? 700 : 400,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            {WINDOW_LABELS[w]}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 14px', fontSize: '0.82rem', color: '#991b1b', marginBottom: 16 }}>
          Failed to load performance data: {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#9ca3af', padding: '40px 0', textAlign: 'center' }}>Loading…</div>
      ) : perf && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <StatBox
              label="Record"
              value={`${perf.wins}-${perf.losses}`}
              sub={perf.pushes > 0 ? `${perf.pushes} pushes` : `${total} graded picks`}
            />
            <StatBox
              label="ROI"
              value={`${perf.roi >= 0 ? '+' : ''}${perf.roi}%`}
              sub="per pick wagered"
              color={perf.roi >= 0 ? '#16a34a' : '#dc2626'}
            />
            <StatBox
              label="CLV"
              value={`${perf.clv >= 0 ? '+' : ''}${perf.clv}%`}
              sub="closing line value"
              color={perf.clv >= 0 ? '#16a34a' : '#dc2626'}
            />
            <StatBox
              label="Win Rate"
              value={total > 0 ? `${Math.round((perf.wins / total) * 100)}%` : '—'}
              sub={`${total} picks graded`}
            />
          </div>

          <InsightsWidget perf={perf30 ?? perf} />
          <SectionBreakdown bySection={perf.bySection} />
          <StatBreakdown byStat={perf.byStat} />

          <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 24, lineHeight: 1.6 }}>
            Track record reflects top-ranked picks only (top 3 straight, top 5 parlay legs, top 3 longshots per day).
            Results are delayed 24 hours. Past performance does not guarantee future results.
          </div>
        </>
      )}

      <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 40, paddingTop: 20, fontSize: '0.72rem', color: '#9ca3af', textAlign: 'center', lineHeight: 1.6 }}>
        For entertainment purposes only. Not a sportsbook. Must be 21+ and in a legal wagering state.
        Gambling involves risk. 1-800-GAMBLER.
      </div>
    </div>
  );
}