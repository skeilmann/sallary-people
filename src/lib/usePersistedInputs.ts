'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { GlobalCalculationInputs } from './types';

const GLOBAL_INPUTS_KEY = 'bonusCalc_globalInputs';
const INDIVIDUAL_REVENUES_KEY = 'bonusCalc_individualRevenues';
const SALARY_OVERRIDES_KEY = 'bonusCalc_salaryOverrides';
const PERIOD_KEY = 'bonusCalc_period';

export function periodKey(quarter: string, year: number): string {
  return `${quarter}-${year}`;
}

const emptyGlobalInputs: GlobalCalculationInputs = {
  totalRevenue: 0,
  taxRate1: 0,
  taxRate2: 0,
};

type GlobalInputsMap = Record<string, GlobalCalculationInputs>;
type WorkerNumberMap = Record<string, Record<string, number>>;

function writeMap(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded – degrade gracefully
  }
}

// Detect and upgrade old flat shape for globalInputs.
// Old: { totalRevenue, taxRate1, taxRate2 }
// New: { [periodKey]: { totalRevenue, taxRate1, taxRate2 } }
function migrateGlobalInputs(currentKey: string): GlobalInputsMap {
  try {
    const raw = localStorage.getItem(GLOBAL_INPUTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    if (
      'totalRevenue' in parsed ||
      'taxRate1' in parsed ||
      'taxRate2' in parsed
    ) {
      const migrated: GlobalInputsMap = {
        [currentKey]: {
          totalRevenue: Number(parsed.totalRevenue) || 0,
          taxRate1: Number(parsed.taxRate1) || 0,
          taxRate2: Number(parsed.taxRate2) || 0,
        },
      };
      writeMap(GLOBAL_INPUTS_KEY, migrated);
      return migrated;
    }
    return parsed as GlobalInputsMap;
  } catch {
    return {};
  }
}

// Detect and upgrade old flat shape for worker-number maps.
// Old: Record<workerId, number>
// New: Record<periodKey, Record<workerId, number>>
function migrateWorkerNumberMap(storageKey: string, currentKey: string): WorkerNumberMap {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    // Heuristic: if any value is a number, this is the old flat shape.
    const values = Object.values(parsed as Record<string, unknown>);
    const isFlat = values.length > 0 && values.every((v) => typeof v === 'number');
    if (isFlat) {
      const migrated: WorkerNumberMap = {
        [currentKey]: parsed as Record<string, number>,
      };
      writeMap(storageKey, migrated);
      return migrated;
    }
    return parsed as WorkerNumberMap;
  } catch {
    return {};
  }
}

/**
 * Period-scoped global inputs (totalRevenue, taxRate1, taxRate2).
 * Switching quarter/year shows the values entered for that period (or zeros).
 */
export function usePersistedGlobalInputs(quarter: string, year: number) {
  const [map, setMap] = useState<GlobalInputsMap>({});
  const [loaded, setLoaded] = useState(false);
  const mapRef = useRef<GlobalInputsMap>({});

  const key = periodKey(quarter, year);

  useEffect(() => {
    const initial = migrateGlobalInputs(periodKey(quarter, year));
    mapRef.current = initial;
    setMap(initial);
    setLoaded(true);
    // quarter/year only matter once for migration target
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === GLOBAL_INPUTS_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as GlobalInputsMap;
          mapRef.current = parsed;
          setMap(parsed);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const globalInputs: GlobalCalculationInputs = map[key] ?? emptyGlobalInputs;

  const setGlobalInputs = useCallback(
    (
      updater:
        | GlobalCalculationInputs
        | ((prev: GlobalCalculationInputs) => GlobalCalculationInputs),
    ) => {
      setMap((prevMap) => {
        const prev = prevMap[key] ?? emptyGlobalInputs;
        const next = typeof updater === 'function' ? updater(prev) : updater;
        const nextMap = { ...prevMap, [key]: next };
        mapRef.current = nextMap;
        writeMap(GLOBAL_INPUTS_KEY, nextMap);
        return nextMap;
      });
    },
    [key],
  );

  return { globalInputs, setGlobalInputs, loaded };
}

/**
 * Period-scoped per-worker individual revenues.
 */
export function usePersistedIndividualRevenues(quarter: string, year: number) {
  return useWorkerNumberMap(INDIVIDUAL_REVENUES_KEY, quarter, year);
}

/**
 * Period-scoped per-worker salary overrides.
 */
export function usePersistedSalaryOverrides(quarter: string, year: number) {
  const hook = useWorkerNumberMap(SALARY_OVERRIDES_KEY, quarter, year);
  return {
    salaryOverrides: hook.values,
    setSalaryOverrides: hook.setValues,
    loaded: hook.loaded,
  };
}

function useWorkerNumberMap(storageKey: string, quarter: string, year: number) {
  const [map, setMap] = useState<WorkerNumberMap>({});
  const [loaded, setLoaded] = useState(false);

  const key = periodKey(quarter, year);

  useEffect(() => {
    const initial = migrateWorkerNumberMap(storageKey, periodKey(quarter, year));
    setMap(initial);
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        try {
          setMap(JSON.parse(e.newValue));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [storageKey]);

  const values: Record<string, number> = map[key] ?? {};

  const setValues = useCallback(
    (
      updater:
        | Record<string, number>
        | ((prev: Record<string, number>) => Record<string, number>),
    ) => {
      setMap((prevMap) => {
        const prev = prevMap[key] ?? {};
        const next = typeof updater === 'function' ? updater(prev) : updater;
        const nextMap = { ...prevMap, [key]: next };
        writeMap(storageKey, nextMap);
        return nextMap;
      });
    },
    [key, storageKey],
  );

  // For the individual-revenues hook we keep the original return shape.
  return {
    individualRevenues: values,
    setIndividualRevenues: setValues,
    values,
    setValues,
    loaded,
  };
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

/**
 * Remove a worker's entries from all period maps in localStorage.
 * Called after deleting a worker so orphan entries don't accumulate.
 */
export function pruneWorkerFromPeriodMaps(workerId: string): void {
  if (typeof window === 'undefined') return;
  for (const storageKey of [INDIVIDUAL_REVENUES_KEY, SALARY_OVERRIDES_KEY]) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;
      const map = JSON.parse(raw);
      if (!map || typeof map !== 'object') continue;
      let changed = false;
      for (const periodK of Object.keys(map)) {
        const inner = map[periodK];
        if (inner && typeof inner === 'object' && workerId in inner) {
          delete inner[workerId];
          changed = true;
        }
      }
      if (changed) {
        localStorage.setItem(storageKey, JSON.stringify(map));
      }
    } catch {
      // ignore
    }
  }
}
