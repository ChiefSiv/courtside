// src/BestBetsPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { useBestBets } from './hooks/useBestBets.js';
import { logTopPicks } from './supabaseQueries.js';

import { FilterBar }                from './components/bestbets/FilterBar.jsx';
import { FeaturedParlay }           from './components/bestbets/FeaturedParlay.jsx';
import { PerformanceSummaryWidget } from './components/bestbets/PerformanceSummaryWidget.jsx';
import { SettingsModal }            from './components/bestbets/SettingsModal.jsx';
import { ParlayBuilderDrawer }      from './components/bestbets/ParlayBuilderDrawer.jsx';
import { EmailCapture }             from './components/bestbets/EmailCapture.jsx';
import { BetCard }                  from './components/bestbets/BetCard.jsx';
import { StretchPicksBanner, LoadingSkeleton, EmptyState, StaleBanner } from './components/bestbets/SmallComponents.jsx';

import './BestBets.css';

const DEFAULT_FILTERS = {
  statTypes:    ['PTS','REB','AST','3PM'],
  excludeTeams: [],
  oddsMin:      -2000,
  oddsMax:      2000,
  minEV:        0,
};

const DEFAULT_SETTINGS_VAL = {
  preferredBooks: ['fanduel'],
};

function loadSettings() {
  try {
    const saved = localStorage.getItem('courtside_bb_settings');
    return saved ? { ...DEFAULT_SETTINGS_VAL, ...JSON.parse(saved) } : DEFAULT_SETTINGS_VAL;
  } catch (e) { void e; return DEFAULT_SETTINGS_VAL; }
}

function saveSettings(s) {
  try { localStorage.setItem('courtside_bb_settings', JSON.stringify(s)); } catch (e) { void e; }
}

const SORT_OPTIONS = [
  { key: 'composite', label: '⭐ Top Picks' },
  { key: 'ev',        label: '📈 Highest EV' },
  { key: 'hitrate',   label: '🎯 Best Hit Rate' },
  { key: 'odds',      label: '💰 Best Odds' },
  { key: 'player',    label: '🔤 Player Name' },
];

function SortBar({ sortKey, onChange, gameOptions, gameFilter, onGameFilter }) {
  return (
    <div className="bb-sort-bar">
      <span className="bb-sort-label">Sort</span>
      {SORT_OPTIONS.map(opt => (
        <button
          key={opt.key}
          className={`bb-sort-btn${sortKey === opt.key ? ' active' : ''}`}
          onClick={() => onChange(opt.key)}
        >
          {opt.label}
        </button>
      ))}

      {gameOptions?.length > 0 && (
        <>
          <span className="bb-sort-divider">|</span>
          <span className="bb-sort-label">Game</span>
          <select
            className={`bb-game-filter${gameFilter !== 'all' ? ' active' : ''}`}
            value={gameFilter}
            onChange={e => onGameFilter(e.target.value)}
          >
            <option value="all">All Games</option>
            {gameOptions.map(g => (
              <option key={g.gameId} value={g.gameId}>{g.label}</option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

const TAB_META = {
  straight: { label: 'Straight Bets',     badge: 'straight', color: '#3b82f6' },
  leg:      { label: 'Parlay Legs',        badge: 'parlay',   color: '#10b981' },
  longshot: { label: 'Longshots',          badge: 'longshot', color: '#f59e0b' },
};

function TabBar({ activeTab, onTabChange, counts }) {
  return (
    <div className="bb-tab-bar">
      {Object.entries(TAB_META).map(([key, meta]) => (
        <button
          key={key}
          className={`bb-tab${activeTab === key ? ' active' : ''}`}
          onClick={() => onTabChange(key)}
          style={activeTab === key ? { borderBottomColor: meta.color, color: meta.color } : {}}
        >
          {meta.label}
          <span className={`bb-tab-count${activeTab === key ? ' active' : ''}`}
            style={activeTab === key ? { background: meta.color } : {}}>
            {counts[key] ?? 0}
          </span>
        </button>
      ))}
    </div>
  );
}

const DEFAULT_SHOW = 20;

function PicksTab({ picks, onAddParlay, parlayPickIds, expandedPicks, onToggleExpand }) {
  const [showAll, setShowAll] = useState(false);
  const isStretch = picks.some(p => p.isStretchPick);
  const displayed = showAll ? picks : picks.slice(0, DEFAULT_SHOW);
  const hasMore   = picks.length > DEFAULT_SHOW;

  if (picks.length === 0) {
    return (
      <div className="bb-empty-tab">
        <div className="bb-empty-tab-icon">🔍</div>
        <div className="bb-empty-tab-msg">No picks in this section today.</div>
        <div className="bb-empty-tab-sub">Check back closer to tip-off as more odds load.</div>
      </div>
    );
  }

  return (
    <div className="bb-picks-tab">
      {isStretch && <StretchPicksBanner />}

      {/* Compact table header */}
      <div className="bb-picks-table-header">
        <span className="bb-col-player">Player</span>
        <span className="bb-col-pick">Pick</span>
        <span className="bb-col-ev">EV%</span>
        <span className="bb-col-hitrate">Hit Rate</span>
        <span className="bb-col-odds">Best Odds</span>
        <span className="bb-col-actions"></span>
      </div>

      <div className="bb-picks-list">
        {displayed.map(pick => (
          <BetCard
            key={pick.pickId}
            pick={pick}
            onAddParlay={onAddParlay}
            isInParlay={parlayPickIds.has(pick.pickId)}
            compact
            isExpanded={expandedPicks?.has(pick.pickId)}
            onToggleExpand={() => onToggleExpand?.(pick.pickId)}
          />
        ))}
      </div>

      {hasMore && (
        <button className="bb-show-all-btn bb-show-all-centered" onClick={() => setShowAll(s => !s)}>
          {showAll ? '↑ Show less' : `↓ Show all ${picks.length} picks`}
        </button>
      )}
    </div>
  );
}

function LegalFooter({ onNavigate }) {
  return (
    <footer className="bb-footer">
      <div className="bb-footer-links">
        <button className="bb-show-all-btn" onClick={() => onNavigate('methodology')}>How it works</button>
        <button className="bb-show-all-btn" onClick={() => onNavigate('performance')}>Track record</button>
        <a href="https://discord.gg/tSWkQXWa" target="_blank" rel="noreferrer">Discord</a>
        <a href="https://www.ncpgambling.org/help-treatment/national-helpline/" target="_blank" rel="noreferrer">
          Responsible Gambling
        </a>
      </div>
      <div className="bb-footer-legal">
        For entertainment purposes only. Not a sportsbook. Must be 21+ to wager legally.
        Past performance does not guarantee future results. Gambling involves risk.
        If you or someone you know has a gambling problem, call 1-800-GAMBLER.
      </div>
    </footer>
  );
}

export function BestBetsPage({ onNavigate = () => {} }) {
  const [filters,      setFilters]      = useState(DEFAULT_FILTERS);
  const [settings,     setSettings]     = useState(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [parlayLegs,   setParlayLegs]   = useState([]);
  const [activeTab,    setActiveTab]    = useState('straight');
  const [sortKey,      setSortKey]      = useState('composite');
  const [gameFilter,   setGameFilter]   = useState('all');
  const [expandedPicks, setExpandedPicks] = useState(new Set());

  const {
    straightBets,
    parlayLegs: qualifyingLegs,
    longshots,
    featuredParlay,
    isLoading,
    hasGamesToday,
    staleBanner,
    errors,
  } = useBestBets(filters, settings);

  useEffect(() => { saveSettings(settings); }, [settings]);

  useEffect(() => {
    if (!isLoading && (straightBets.length || qualifyingLegs.length || longshots.length)) {
      logTopPicks(straightBets, qualifyingLegs, longshots).catch(console.error);
    }
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddParlay = useCallback((pick) => {
    setParlayLegs(prev => {
      if (prev.find(l => l.pick.pickId === pick.pickId)) return prev;
      return [...prev, { pick, addedAt: new Date().toISOString() }];
    });
  }, []);

  const handleRemoveParlay = useCallback((pickId) => {
    setParlayLegs(prev => prev.filter(l => l.pick.pickId !== pickId));
  }, []);

  const parlayPickIds = new Set(parlayLegs.map(l => l.pick.pickId));

  function sortPicks(picks) {
    return [...picks].sort((a, b) => {
      switch (sortKey) {
        case 'ev':       return b.ev.evPct - a.ev.evPct;
        case 'hitrate':  return b.hitRate.pct - a.hitRate.pct;
        case 'player':   return a.playerName.localeCompare(b.playerName);
        case 'odds': {
          const getOdds = p => p.bestBook?.isMilestone ? p.bestBook.overOdds
            : p.ev.direction === 'over' ? p.bestBook?.overOdds : p.bestBook?.underOdds;
          return getOdds(b) - getOdds(a);
        }
        default:         return b.composite.score - a.composite.score;
      }
    });
  }

  // Derive unique games from all picks for the filter dropdown
  const allPicks = [...straightBets, ...qualifyingLegs, ...longshots];
  const gameOptions = [...new Map(allPicks.map(p => [
    String(p.gameId),
    { gameId: String(p.gameId), label: `${p.playerTeam} vs ${p.opponentTeam}`, gameTime: p.gameTime }
  ])).values()].sort((a, b) => new Date(a.gameTime) - new Date(b.gameTime));

  function applyGameFilter(picks) {
    if (gameFilter === 'all') return picks;
    // gameId may be number or string depending on source — coerce both
    return picks.filter(p => String(p.gameId) === String(gameFilter));
  }

  const tabPicks = {
    straight: sortPicks(applyGameFilter(straightBets)),
    leg:      sortPicks(applyGameFilter(qualifyingLegs)),
    longshot: sortPicks(applyGameFilter(longshots)),
  };

  const counts = {
    straight: straightBets.length,
    leg:      qualifyingLegs.length,
    longshot: longshots.length,
  };

  if (!isLoading && !hasGamesToday) {
    return (
      <div className="bb-page">
        <EmptyState noGames />
        <LegalFooter onNavigate={onNavigate} />
      </div>
    );
  }

  return (
    <div className="bb-page">

      <div className="bb-page-header">
        <h1 className="bb-page-title">🏀 Best Bets</h1>
        <div className="bb-header-actions">
          <button className="bb-header-btn" onClick={() => onNavigate('methodology')}>How it works</button>
          <a href="https://discord.gg/tSWkQXWa" target="_blank" rel="noreferrer" className="bb-header-btn discord">
            💬 Discord
          </a>
          <button className="bb-header-btn" onClick={() => setShowSettings(true)} title="Settings">
            ⚙ Books
          </button>
        </div>
      </div>

      <PerformanceSummaryWidget />
      <StaleBanner staleBanner={staleBanner} />

      {errors.map((err, i) => (
        <div key={i} className="bb-stale-banner" style={{ background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }}>
          ⚠ {err}
        </div>
      ))}

      <FilterBar filters={filters} onChange={setFilters} />

      {!isLoading && <FeaturedParlay parlay={featuredParlay} />}

      <div className="bb-tabs-container">
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />
        <SortBar sortKey={sortKey} onChange={setSortKey} gameOptions={gameOptions} gameFilter={gameFilter} onGameFilter={setGameFilter} />

        {isLoading ? (
          <div className="bb-tab-content">
            <LoadingSkeleton />
          </div>
        ) : (
          <div className="bb-tab-content">
            <PicksTab
              picks={tabPicks[activeTab]}
              onAddParlay={handleAddParlay}
              parlayPickIds={parlayPickIds}
              expandedPicks={expandedPicks}
              onToggleExpand={(id) => setExpandedPicks(prev => {
                const next = new Set(prev);
                next.has(id) ? next.delete(id) : next.add(id);
                return next;
              })}
            />
          </div>
        )}
      </div>

      <EmailCapture source="best-bets-page" />
      <LegalFooter onNavigate={onNavigate} />

      {showSettings && (
        <SettingsModal settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />
      )}

      <ParlayBuilderDrawer
        legs={parlayLegs}
        onRemove={handleRemoveParlay}
        onClear={() => setParlayLegs([])}
      />
    </div>
  );
}