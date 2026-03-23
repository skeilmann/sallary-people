'use client';

import { useState, useEffect, useCallback } from 'react';
import type { GlobalCalculationInputs } from './types';

const GLOBAL_INPUTS_KEY = 'bonusCalc_globalInputs';
const INDIVIDUAL_REVENUES_KEY = 'bonusCalc_individualRevenues';
const PERIOD_KEY = 'bonusCalc_period';

/**
 * Persist and sync global calculation inputs across pages and refreshes.
 *
 * Uses localStorage for persistence and the `storage` event for cross-tab sync.
 * Values are stored independently of the period so they remain visible when
 * switching pages, but a separate period key tracks the selected quarter/year.
 */
export function usePersistedGlobalInputs() {
  const [globalInputs, setGlobalInputsState] = useState<GlobalCalculationInputs>({
    totalRevenue: 0,
    taxRate1: 0,
    taxRate2: 0,
  });
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(GLOBAL_INPUTS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as GlobalCalculationInputs;
        setGlobalInputsState(parsed);
      }
    } catch {
      // ignore parse errors
    }
    setLoaded(true);
  }, []);

  // Listen for changes from other tabs/pages
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === GLOBAL_INPUTS_KEY && e.newValue) {
        try {
          setGlobalInputsState(JSON.parse(e.newValue));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Wrapper that persists on every change
  const setGlobalInputs = useCallback(
    (updater: GlobalCalculationInputs | ((prev: GlobalCalculationInputs) => GlobalCalculationInputs)) => {
      setGlobalInputsState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        try {
          localStorage.setItem(GLOBAL_INPUTS_KEY, JSON.stringify(next));
        } catch {
          // quota exceeded – degrade gracefully
        }
        return next;
      });
    },
    [],
  );

  return { globalInputs, setGlobalInputs, loaded };
}

/**
 * Persist per-worker individual revenues across pages and refreshes.
 */
export function usePersistedIndividualRevenues() {
  const [individualRevenues, setIndividualRevenuesState] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(INDIVIDUAL_REVENUES_KEY);
      if (stored) {
        setIndividualRevenuesState(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === INDIVIDUAL_REVENUES_KEY && e.newValue) {
        try {
          setIndividualRevenuesState(JSON.parse(e.newValue));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setIndividualRevenues = useCallback(
    (updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => {
      setIndividualRevenuesState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        try {
          localStorage.setItem(INDIVIDUAL_REVENUES_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [],
  );

  return { individualRevenues, setIndividualRevenues, loaded };
}

/**
 * Persist the selected period (quarter + year) across pages and refreshes.
 */
export function usePersistedPeriod(defaultQuarter: string, defaultYear: number) {
  const [quarter, setQuarterState] = useState(defaultQuarter);
  const [year, setYearState] = useState(defaultYear);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PERIOD_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.quarter) setQuarterState(parsed.quarter);
        if (parsed.year) setYearState(parsed.year);
      }
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === PERIOD_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed.quarter) setQuarterState(parsed.quarter);
          if (parsed.year) setYearState(parsed.year);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setQuarter = useCallback((q: string) => {
    setQuarterState(q);
    try {
      const stored = localStorage.getItem(PERIOD_KEY);
      const current = stored ? JSON.parse(stored) : {};
      localStorage.setItem(PERIOD_KEY, JSON.stringify({ ...current, quarter: q }));
    } catch {
      // ignore
    }
  }, []);

  const setYear = useCallback((y: number) => {
    setYearState(y);
    try {
      const stored = localStorage.getItem(PERIOD_KEY);
      const current = stored ? JSON.parse(stored) : {};
      localStorage.setItem(PERIOD_KEY, JSON.stringify({ ...current, year: y }));
    } catch {
      // ignore
    }
  }, []);

  return { quarter, year, setQuarter, setYear, loaded };
}
