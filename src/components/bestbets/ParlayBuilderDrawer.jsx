// src/components/bestbets/ParlayBuilderDrawer.jsx

import { useState } from 'react';
import { evaluateParlayCorrelation } from '../../algorithm/parlay.js';
import { americanToDecimal, decimalToAmerican } from '../../algorithm/ev.js';

function formatOdds(o) { return o > 0 ? `+${o}` : `${o}`; }

function calcCombinedOdds(legs) {
  if (!legs.length) return null;
  let dec = 1;
  for (const leg of legs) {
    const odds = leg.pick.ev.direction === 'over'
      ? leg.pick.bestBook.overOdds
      : leg.pick.bestBook.underOdds;
    dec *= americanToDecimal(odds);
  }
  return decimalToAmerican(dec);
}

function calcModelProb(legs) {
  return legs.reduce((p, l) => p * l.pick.ev.modelProb, 1);
}

export function ParlayBuilderDrawer({ legs, onRemove, onClear }) {
  const [open, setOpen] = useState(true);

  const correlation    = legs.length >= 2
    ? evaluateParlayCorrelation(legs.map(l => l.pick))
    : 'NEUTRAL';
  const combinedOdds  = calcCombinedOdds(legs);
  const modelProb     = calcModelProb(legs);
  const hasSameGame   = new Set(legs.map(l => l.pick.gameId)).size < legs.length;

  if (!legs.length) return null;

  return (
    <div className={`bb-parlay-drawer${open ? '' : ' collapsed'}`}>
      <div className="bb-parlay-drawer-header" onClick={() => setOpen(o => !o)}>
        <div className="bb-parlay-drawer-title">
          🎯 Parlay Builder
          <span className="bb-parlay-count">{legs.length}</span>
        </div>
        <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>{open ? '▾' : '▴'}</span>
      </div>

      <div className="bb-parlay-drawer-body">
        {legs.map((leg) => {
          const odds = leg.pick.ev.direction === 'over'
            ? leg.pick.bestBook.overOdds
            : leg.pick.bestBook.underOdds;
          return (
            <div key={leg.pick.pickId} className="bb-parlay-leg-row">
              <div>
                <div className="bb-parlay-leg-name">
                  {leg.pick.playerName} {leg.pick.ev.direction === 'over' ? 'O' : 'U'} {leg.pick.lineValue} {leg.pick.stat}
                </div>
                <div className="bb-parlay-leg-odds">
                  {leg.pick.bestBook.vendor}: {formatOdds(odds)}
                </div>
              </div>
              <button className="bb-parlay-remove" onClick={() => onRemove(leg.pick.pickId)}>✕</button>
            </div>
          );
        })}

        {legs.length >= 2 && (
          <div className="bb-parlay-summary">
            <div className="bb-parlay-summary-row">
              <span>Combined odds</span>
              <strong>{combinedOdds != null ? formatOdds(combinedOdds) : '—'}</strong>
            </div>
            <div className="bb-parlay-summary-row">
              <span>Model probability</span>
              <strong>{Math.round(modelProb * 100)}%</strong>
            </div>
            <div>
              <span className={`bb-parlay-correlation ${correlation}`}>
                {correlation} correlation
              </span>
            </div>
            {hasSameGame && (
              <div className="bb-same-game-warning">
                ⚠ Same-game legs detected — book pricing may differ
              </div>
            )}
          </div>
        )}

        <button className="bb-parlay-clear" onClick={onClear}>Clear all</button>
      </div>
    </div>
  );
}