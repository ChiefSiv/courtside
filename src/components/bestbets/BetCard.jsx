// src/components/bestbets/BetCard.jsx
import { useState } from 'react';
import { MiniBarChart } from './MiniBarChart.jsx';
import { ProjectionBreakdown } from './ProjectionBreakdown.jsx';
import {
  StarRating, EVBadge, LineMovementIndicator,
  StalePickWarning, MatchupBadge,
} from './SmallComponents.jsx';

function getInitials(name) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function formatOdds(odds) {
  if (odds == null) return '—';
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatGameTime(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  } catch {
    return dateStr;
  }
}

// ---- Compact row (new default) -----------------------------

function BetCardCompact({ pick, onExpand, onAddParlay, isInParlay }) {
  const {
    playerName, playerTeam, opponentTeam,
    stat, lineValue,
    bestBook, bestPriceAlert,
    ev, hitRate, composite, availability,
    lineMovement,
  } = pick;

  const statLabel = `${ev.direction === 'over' ? 'O' : 'U'} ${lineValue} ${stat}`;
  const bestOdds  = bestBook?.isMilestone ? bestBook.overOdds
    : ev.direction === 'over' ? bestBook?.overOdds : bestBook?.underOdds;

  return (
    <div className="bb-compact-row" onClick={onExpand}>

      {/* Avatar + player */}
      <div className="bb-compact-player">
        <div className="bb-compact-avatar">{getInitials(playerName)}</div>
        <div className="bb-compact-player-info">
          <div className="bb-compact-name">{playerName}</div>
          <div className="bb-compact-meta">
            {playerTeam} · vs {opponentTeam}
  
          </div>
          {/* Pick label shown inline on mobile */}
          <div className="bb-compact-pick-mobile">{statLabel}</div>
        </div>
      </div>

      {/* Pick */}
      <div className="bb-compact-pick">
        <span className="bb-compact-stat">{statLabel}</span>
        {lineMovement?.direction && lineMovement.from != null && lineMovement.to != null && lineMovement.from !== lineMovement.to && (
          <span className={`bb-compact-movement ${lineMovement.direction}`}>
            {lineMovement.direction === 'up' ? '↑' : '↓'} {lineMovement.from}→{lineMovement.to}
          </span>
        )}
      </div>

      {/* EV */}
      <div className="bb-compact-ev">
        <EVBadge evPct={ev.evPct} />
        <StarRating stars={composite.stars} tiny />
      </div>

      {/* Hit rate — directional */}
      {(() => {
        const dirPct = ev.direction === 'under' ? (hitRate.under?.pct ?? 0) : (hitRate.over?.pct ?? hitRate.pct ?? 0);
        const dirHits = ev.direction === 'under' ? (hitRate.under?.hits ?? 0) : (hitRate.over?.hits ?? hitRate.hits ?? 0);
        return (
          <div className="bb-compact-hitrate">
            <span className="bb-compact-hr-pct" style={{ color: dirPct >= 70 ? '#10b981' : dirPct >= 55 ? '#f59e0b' : '#ef4444' }}>
              {dirPct}%
            </span>
            <span className="bb-compact-hr-sub">{dirHits}/{hitRate.total}</span>
          </div>
        );
      })()}

      {/* Best odds */}
      <div className="bb-compact-odds">
        <span className="bb-compact-book">{bestBook?.vendor}</span>
        <span className={`bb-compact-price ${bestOdds > 0 ? 'positive' : ''}`}>
          {formatOdds(bestOdds)}
        </span>
        {bestPriceAlert && (
          <span className="bb-compact-better">↑ {bestPriceAlert.vendor}</span>
        )}
      </div>

      {/* Actions */}
      <div className="bb-compact-actions" onClick={e => e.stopPropagation()}>
        <button
          className={`bb-add-parlay-btn small${isInParlay ? ' added' : ''}`}
          onClick={() => onAddParlay(pick)}
        >
          {isInParlay ? '✓' : '+'}
        </button>
        <button className="bb-expand-chevron" onClick={onExpand}>
          ▾
        </button>
      </div>
    </div>
  );
}

// ---- Full collapsed card (used inside expanded) ------------

function BetCardCollapsed({ pick, onExpand, onAddParlay, isInParlay }) {
  const {
    playerName, playerTeam, playerPosition, opponentTeam,
    gameTime, stat, lineValue,
    bookOdds, bestBook, bestPriceAlert,
    ev, hitRate, matchup, composite,
    reasoningText, lineMovement, availability,
    isStale, staleReason, generatedAt, oddsLastUpdated,
  } = pick;

  const statLabel = ev.direction === 'over'
    ? `Over ${lineValue} ${stat}`
    : `Under ${lineValue} ${stat}`;

  return (
    <div className="bb-card-collapsed" onClick={onExpand}>
      <div className="bb-card-left">
        <div className="bb-card-player-row">
          <div className="bb-card-headshot">
            {pick.playerHeadshot
              ? <img src={pick.playerHeadshot} alt={playerName} />
              : getInitials(playerName)}
          </div>
          <div className="bb-card-player-info">
            <div className="bb-card-player-name">{playerName}</div>
            <div className="bb-card-player-meta">
              {playerTeam} · {playerPosition} · vs {opponentTeam}
            </div>
          </div>
          <div className="bb-card-game-time">{formatGameTime(gameTime)}</div>
        </div>

        <div className="bb-card-stat-line">
          <span>{statLabel}</span>

        </div>

        <div className="bb-odds-row" onClick={e => e.stopPropagation()}>
          {(bookOdds ?? []).map((b, i) => {
            const isBest = b.vendor === bestBook?.vendor;
            const odds   = b.isMilestone ? b.overOdds
              : ev.direction === 'over' ? b.overOdds : b.underOdds;
            if (odds == null) return null;
            return (
              <span key={i} className={`bb-odds-chip${isBest ? ' best' : ''}`}>
                {b.vendor}: {formatOdds(odds)}
              </span>
            );
          })}
          {bestPriceAlert && bestPriceAlert.odds != null && (
            <span className="bb-better-elsewhere">
              Better at {bestPriceAlert.vendor}: {formatOdds(bestPriceAlert.odds)}
            </span>
          )}
        </div>

        <div className="bb-card-stats-row">
          <EVBadge evPct={ev.evPct} />
          <StarRating stars={composite.stars} />
          <div className="bb-hit-rate">
            {(() => {
              const dirPct  = ev.direction === 'under' ? (hitRate.under?.pct ?? 0) : (hitRate.over?.pct ?? hitRate.pct ?? 0);
              const dirHits = ev.direction === 'under' ? (hitRate.under?.hits ?? 0) : (hitRate.over?.hits ?? hitRate.hits ?? 0);
              return <><span>{dirHits}/{hitRate.total}</span> — {dirPct}%</>;
            })()}
          </div>
          <MatchupBadge matchup={matchup} />
        </div>

        <StalePickWarning isStale={isStale} staleReason={staleReason} />
        <div className="bb-reasoning">{reasoningText}</div>
        <div className="bb-timestamps">
          <span>Generated: {new Date(generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
          <span>Odds: {new Date(oddsLastUpdated).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
        </div>
      </div>

      <div className="bb-card-right" onClick={e => e.stopPropagation()}>
        <MiniBarChart games={hitRate.games} line={lineValue} />
        <LineMovementIndicator movement={lineMovement} />
        <div className="bb-card-actions">
          <button
            className={`bb-add-parlay-btn${isInParlay ? ' added' : ''}`}
            onClick={e => { e.stopPropagation(); onAddParlay(pick); }}
          >
            {isInParlay ? '✓ Added' : '+ Parlay'}
          </button>
          <button className="bb-betslip-btn" title="Coming soon" onClick={e => e.stopPropagation()}>
            Add to Betslip
          </button>
          <button className="bb-expand-btn" onClick={onExpand} title="Collapse">▴</button>
        </div>
      </div>
    </div>
  );
}

// ---- Expanded detail panel ---------------------------------

function BetCardExpanded({ pick, onCollapse }) {
  const { stat, lineValue, ev, projection, hitRate } = pick;

  const comparableGames = hitRate.games.filter(g => g.hitLine).slice(0, 5);
  const comparableAvg   = comparableGames.length
    ? (comparableGames.reduce((s, g) => s + g.statValue, 0) / comparableGames.length).toFixed(1)
    : null;

  return (
    <div className="bb-card-expanded">
      <div className="bb-expanded-grid">
        <ProjectionBreakdown projection={projection} ev={ev} line={lineValue} stat={stat} />
        <div className="bb-comparable">
          {comparableAvg && (
            <div className="bb-comparable-note">
              📊 Similar spots: last {comparableGames.length} games player hit line,
              averaged <strong>{comparableAvg} {stat}</strong>
            </div>
          )}
          <div className="bb-proj-title">Last {hitRate.games.length} Games</div>
          <table className="bb-history-table">
            <thead>
              <tr><th>Date</th><th>Opp</th><th>{stat}</th><th>Line</th><th>Result</th></tr>
            </thead>
            <tbody>
              {hitRate.games.slice(0, 15).map((g, i) => (
                <tr key={i}>
                  <td>{g.date?.slice(5)}</td>
                  <td>{g.opponent}</td>
                  <td style={{ fontWeight: 600 }}>{g.statValue}</td>
                  <td style={{ color: '#9ca3af' }}>{lineValue}</td>
                  <td className={((ev.direction === 'under') ? !g.hitLine : g.hitLine) ? 'hit' : 'miss'}>
                    {((ev.direction === 'under') ? !g.hitLine : g.hitLine) ? '✓' : '✗'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <button onClick={onCollapse} className="bb-collapse-btn">▴ Collapse</button>
    </div>
  );
}

// ---- Main export -------------------------------------------

export function BetCard({ pick, onAddParlay, isInParlay, compact = false, isExpanded, onToggleExpand }) {
  const [localExpanded, setLocalExpanded] = useState(false);
  // Use controlled state if provided (prevents reset on refetch), else use local
  const expanded = isExpanded !== undefined ? isExpanded : localExpanded;
  const toggleExpand = onToggleExpand ?? (() => setLocalExpanded(e => !e));

  if (compact && !expanded) {
    return (
      <div className={`bb-compact-card${pick.isStale ? ' stale' : ''}`} data-pick-id={pick.pickId}>
        <BetCardCompact
          pick={pick}
          onExpand={toggleExpand}
          onAddParlay={onAddParlay}
          isInParlay={isInParlay}
        />
      </div>
    );
  }

  if (compact && expanded) {
    return (
      <div className={`bb-compact-card expanded${pick.isStale ? ' stale' : ''}`} data-pick-id={pick.pickId}>
        <BetCardCollapsed
          pick={pick}
          onExpand={toggleExpand}
          onAddParlay={onAddParlay}
          isInParlay={isInParlay}
        />
        <BetCardExpanded pick={pick} onCollapse={toggleExpand} />
      </div>
    );
  }

  return (
    <div className={`bb-card${pick.isStale ? ' stale' : ''}`} data-pick-id={pick.pickId}>
      <BetCardCollapsed
        pick={pick}
        onExpand={toggleExpand}
        onAddParlay={onAddParlay}
        isInParlay={isInParlay}
      />
      {expanded && <BetCardExpanded pick={pick} onCollapse={toggleExpand} />}
    </div>
  );
}