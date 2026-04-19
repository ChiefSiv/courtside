// src/components/bestbets/SectionBlock.jsx

import { useState } from 'react';
import { BetCard } from './BetCard.jsx';
import { StretchPicksBanner, LoadingSkeleton } from './SmallComponents.jsx';

const SECTION_META = {
  straight: { label: 'Best Straight Bets',      badge: 'straight', badgeLabel: 'Top Picks' },
  leg:      { label: 'Best Parlay Legs',         badge: 'parlay',   badgeLabel: 'Parlay' },
  longshot: { label: 'Data-Backed Longshots',    badge: 'longshot', badgeLabel: 'Longshots' },
};

const DEFAULT_SHOW = 10;

export function SectionBlock({ section, picks, isLoading, onAddParlay, parlayPickIds }) {
  const [showAll, setShowAll] = useState(false);
  const meta       = SECTION_META[section] ?? SECTION_META.straight;
  const isStretch  = picks.some(p => p.isStretchPick);
  const displayed  = showAll ? picks : picks.slice(0, DEFAULT_SHOW);
  const hasMore    = picks.length > DEFAULT_SHOW;

  return (
    <div className="bb-section">
      <div className="bb-section-header">
        <h2 className="bb-section-title">
          {meta.label}
          <span className={`bb-section-badge ${meta.badge}`}>{meta.badgeLabel}</span>
          {picks.length > 0 && (
            <span style={{ fontSize: '0.78rem', fontWeight: 400, color: '#9ca3af' }}>
              {picks.length} qualifying
            </span>
          )}
        </h2>
        {hasMore && (
          <button className="bb-show-all-btn" onClick={() => setShowAll(s => !s)}>
            {showAll ? 'Show less' : `Show all ${picks.length}`}
          </button>
        )}
      </div>

      {isStretch && <StretchPicksBanner />}

      {isLoading ? (
        <LoadingSkeleton />
      ) : displayed.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '12px 0' }}>
          No picks in this section today.
        </div>
      ) : (
        displayed.map(pick => (
          <BetCard
            key={pick.pickId}
            pick={pick}
            onAddParlay={onAddParlay}
            isInParlay={parlayPickIds.has(pick.pickId)}
          />
        ))
      )}
    </div>
  );
}