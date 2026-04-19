// src/algorithm/filters.js

function getBestOdds(pick) {
  if (pick.bestBook?.isMilestone) return pick.bestBook.overOdds;
  return pick.ev.direction === 'over' ? pick.bestBook.overOdds : pick.bestBook.underOdds;
}

function isOddsInRange(pick, min, max) {
  const odds = getBestOdds(pick);
  return odds >= min && odds <= max;
}

// Returns hit rate % in the direction of the bet
// Falls back to legacy hitRate.pct (over%) if new structure not present
function directedHitRate(pick) {
  const isOver = pick.ev.direction === 'over';
  if (isOver) {
    return pick.hitRate.over?.pct ?? pick.hitRate.pct ?? 0;
  } else {
    return pick.hitRate.under?.pct ?? (100 - (pick.hitRate.pct ?? 0));
  }
}

function filterStraight(picks, stretch) {
  return picks
    .filter(p => {
      const isOver    = p.ev.direction === 'over';
      const modelProb = isOver ? p.probability?.pOver : p.probability?.pUnder;
      const probOk    = stretch ? modelProb >= 0.35 : modelProb >= 0.45;
      const hrPct     = directedHitRate(p);
      const hitRateOk = stretch
        ? hrPct >= 30
        : (isOver ? hrPct >= 50 : hrPct >= 60);
      const matchupOk = isOver ? p.matchup.qualifies : true;

      return (
        !p.bestBook?.isMilestone &&
        (stretch || p.ev.evPct >= 3) &&
        hitRateOk &&
        probOk &&
        matchupOk &&
        p.availability.passes
      );
    })
    .map(p => ({ ...p, section: 'straight', isStretchPick: stretch }));
}

function filterLeg(picks, stretch) {
  return picks
    .filter(p => {
      const isOver      = p.ev.direction === 'over';
      const hrPct       = directedHitRate(p);
      // Milestones still need 70% hit rate — isMilestone just skips direction logic
      const hitRateOk   = hrPct >= 70;
      const matchupOk   = isOver ? p.matchup.qualifies : true;
      const oddsOk      = isOddsInRange(p, -500, -120);
      const evOk        = stretch || p.ev.evPct >= 1;

      return evOk && hitRateOk && matchupOk && p.availability.passes && oddsOk;
    })
    .map(p => ({ ...p, section: 'leg', isStretchPick: stretch }));
}

function filterLongshot(picks, stretch) {
  const hrPct = p => directedHitRate(p);

  const filtered = picks
    .filter(p =>
      isOddsInRange(p, 500, 2500) &&
      (stretch ? p.ev.evPct >= 5 : p.ev.evPct >= 10) &&
      p.form.qualifies &&                          // always required
      hrPct(p) >= 20 &&                            // must have hit at least 3/15
      p.availability.passes
    )
    .map(p => ({ ...p, section: 'longshot', isStretchPick: stretch }));

  // One pick per player — keep highest composite score
  const bestPerPlayer = new Map();
  for (const p of filtered) {
    const existing = bestPerPlayer.get(p.playerId);
    if (!existing || p.composite.score > existing.composite.score) {
      bestPerPlayer.set(p.playerId, p);
    }
  }

  return [...bestPerPlayer.values()];
}

export function applySectionFilters(picks) {
  const straight = filterStraight(picks, false);
  const leg      = filterLeg(picks, false);
  const longshot = filterLongshot(picks, false);

  return {
    straight: straight.length > 0 ? straight : filterStraight(picks, true),
    leg:      leg.length      > 0 ? leg      : filterLeg(picks, true),
    longshot: longshot.length > 0 ? longshot : filterLongshot(picks, true),
  };
}

export function rankBySection(picks) {
  return [...picks]
    .sort((a, b) => b.composite.score - a.composite.score)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}