// src/components/bestbets/SmallComponents.jsx
// StarRating, LineMovementIndicator, StalePickWarning,
// StretchPicksBanner, EmptyState — all in one file for convenience

import { evColorClass } from '../../algorithm/ev.js';

// ---- StarRating ---------------------------------------------

export function StarRating({ stars }) {
  const full  = Math.floor(stars);
  const half  = stars % 1 >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);

  return (
    <span className="bb-stars" title={`${stars} / 5 stars`}>
      {'★'.repeat(full)}
      {half ? '½' : ''}
      {'☆'.repeat(empty)}
    </span>
  );
}

// ---- EVBadge ------------------------------------------------

export function EVBadge({ evPct }) {
  const cls = evColorClass(evPct);
  const sign = evPct > 0 ? '+' : '';
  return (
    <span className={`bb-ev-badge ${cls}`}>
      {sign}{evPct.toFixed(1)}% EV
    </span>
  );
}

// ---- LineMovementIndicator ----------------------------------

export function LineMovementIndicator({ movement }) {
  if (!movement || movement.direction === 'none') return null;

  const arrow = movement.direction === 'up' ? '↑' : '↓';
  const cls   = movement.direction === 'up'   ? 'up' : 'down';
  const label = movement.direction === 'up'
    ? `Line moved ${movement.openingLine} → ${movement.currentLine}`
    : `Line moved ${movement.openingLine} → ${movement.currentLine}`;

  return (
    <div className={`bb-line-movement ${cls}`} title={label}>
      {arrow} {label}
    </div>
  );
}

// ---- StalePickWarning ---------------------------------------

export function StalePickWarning({ isStale, staleReason }) {
  if (!isStale) return null;
  return (
    <div className="bb-stale-pick">
      ⚠ Injury update — projection may be stale{staleReason ? `: ${staleReason}` : ''}
    </div>
  );
}

// ---- MatchupBadge -------------------------------------------

export function MatchupBadge({ matchup }) {
  if (!matchup) return null;
  const cls   = matchup.qualifies ? 'good' : 'neutral';
  const label = matchup.qualifies
    ? `Favorable (+${matchup.opponentAllowsPct}%)`
    : 'Neutral matchup';
  return <span className={`bb-matchup-badge ${cls}`}>{label}</span>;
}

// ---- StretchPicksBanner -------------------------------------

export function StretchPicksBanner() {
  return (
    <div className="bb-stretch-banner">
      ⚡ Stretch Picks — no high-EV qualifiers today. Showing all picks meeting basic criteria.
    </div>
  );
}

// ---- EmptyState ---------------------------------------------

export function EmptyState({ noGames }) {
  if (noGames) {
    return (
      <div className="bb-empty">
        <div className="bb-empty-icon">🏀</div>
        <div className="bb-empty-title">No NBA games today</div>
        <div>Check back tomorrow for Best Bets.</div>
      </div>
    );
  }

  return (
    <div className="bb-empty">
      <div className="bb-empty-icon">🔍</div>
      <div className="bb-empty-title">No qualifying picks found</div>
      <div>Try relaxing your filters or check back closer to tip-off.</div>
    </div>
  );
}

// ---- LoadingSkeleton ----------------------------------------

export function LoadingSkeleton() {
  return (
    <div>
      {[1, 2, 3].map(i => (
        <div key={i} className="bb-skeleton bb-skeleton-card" />
      ))}
    </div>
  );
}

// ---- StaleBanner (page-level) --------------------------------

export function StaleBanner({ staleBanner }) {
  if (!staleBanner?.isStale) return null;
  return (
    <div className="bb-stale-banner">
      ⚠ Data may be stale — last updated {staleBanner.label}
    </div>
  );
}

// ---- LineupTBD badge ----------------------------------------

export function LineupTBDBadge({ availability }) {
  if (availability?.lineupConfirmed) return null;
  return <span className="bb-lineup-tbd">Lineup TBD</span>;
}