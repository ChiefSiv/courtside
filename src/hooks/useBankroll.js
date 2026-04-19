// src/hooks/useBankroll.js
// Persists bankroll setting and exposes Kelly recalculation

import { useState, useCallback } from 'react';
import { calculateKelly, calculateParlayKelly } from '../algorithm/kelly.js';

const STORAGE_KEY = 'courtside_bankroll';
const DEFAULT_BANKROLL = 1000;

export function useBankroll() {
  const [bankroll, setBankrollRaw] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? Math.max(1, parseInt(saved)) : DEFAULT_BANKROLL;
    } catch { return DEFAULT_BANKROLL; }
  });

  const setBankroll = useCallback((val) => {
    const n = Math.max(1, parseInt(val) || DEFAULT_BANKROLL);
    setBankrollRaw(n);
    try { localStorage.setItem(STORAGE_KEY, String(n)); } catch { /* noop */ }
  }, []);

  // Recalculates kelly for a pick with the current bankroll
  const getKelly = useCallback((pick) => {
    if (!pick?.ev || !pick?.bestBook) return { units: 0, dollars: 0, isNoBet: true };
    const odds = pick.ev.direction === 'over'
      ? pick.bestBook.overOdds
      : (pick.bestBook.underOdds ?? pick.bestBook.overOdds);
    if (!odds || !pick.ev.modelProb) return { units: 0, dollars: 0, isNoBet: true };
    const result = calculateKelly({
      modelProb:    pick.ev.modelProb,
      americanOdds: odds,
      section:      pick.section ?? 'straight',
      bankroll,
      minBet:       1,
      maxBetPct:    0.05,
    });
    return result;
  }, [bankroll]);

  const getParlayKelly = useCallback((legs) => {
    return calculateParlayKelly({ legs, bankroll, minBet: 1, maxBetPct: 0.10 });
  }, [bankroll]);

  return { bankroll, setBankroll, getKelly, getParlayKelly };
}