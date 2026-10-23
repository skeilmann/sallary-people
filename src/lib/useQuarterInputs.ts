'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { CalculationWithWorker, Worker } from './types';
import {
  isPaidPerDay,
  isSeller,
  resolveCompanyRevenue,
  seedFromSaved,
  type WhatIfBonus,
} from './money-flow';

const QUARTERS_KEY = 'bonusCalc_quarters';

/** What was typed for one quarter. Missing keys fall back to the saved quarter. */
interface QuarterDraft {
  /** null = left empty on purpose (use the sellers' total). */
  companyRevenue?: number | null;
  sales?: Record<string, number>;
  /** Days worked by people paid per day. */
  days?: Record<string, number>;
  whatIf?: Record<string, WhatIfBonus>;
}

type QuarterDrafts = Record<string, QuarterDraft>;

// ---- Small localStorage-backed store shared by every page in this tab ----

const EMPTY: QuarterDrafts = {};
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedDrafts: QuarterDrafts = EMPTY;
// When localStorage is unavailable or full, keep drafts in memory only.
let memoryOnly = false;

function readDrafts(): QuarterDrafts {
  if (memoryOnly) return cachedDrafts;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(QUARTERS_KEY);
  } catch {
    return cachedDrafts;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedDrafts = raw ? (JSON.parse(raw) as QuarterDrafts) : EMPTY;
    } catch {
      cachedDrafts = EMPTY;
    }
  }
  return cachedDrafts;
}

function writeDrafts(next: QuarterDrafts) {
  cachedDrafts = next;
  try {
    const raw = JSON.stringify(next);
    localStorage.setItem(QUARTERS_KEY, raw);
    cachedRaw = raw;
  } catch {
    memoryOnly = true;
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === QUARTERS_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function getServerSnapshot(): QuarterDrafts {
  return EMPTY;
}

/**
 * Sales, company total and what-if bonuses for one quarter. Each quarter
 * keeps its own numbers, so a new quarter starts empty instead of showing
 * last quarter's sales. A quarter that was saved shows what was saved until
 * someone types over it.
 */
export function useQuarterInputs(
  period: string,
  workers: Worker[],
  calculationsByWorker: Record<string, CalculationWithWorker[]>,
) {
  const drafts = useSyncExternalStore(subscribe, readDrafts, getServerSnapshot);
  const draft = drafts[period];

  const latestSaved = useMemo(() => {
    const latest: Record<string, CalculationWithWorker | undefined> = {};
    for (const [workerId, calcs] of Object.entries(calculationsByWorker)) {
      latest[workerId] = calcs[0];
    }
    return latest;
  }, [calculationsByWorker]);

  const seed = useMemo(() => seedFromSaved(workers, latestSaved), [workers, latestSaved]);

  const sales = useMemo(() => {
    const out: Record<string, number> = {};
    for (const w of workers) {
      if (isSeller(w)) out[w.id] = draft?.sales?.[w.id] ?? seed.sales[w.id] ?? 0;
    }
    return out;
  }, [workers, draft, seed]);

  const days = useMemo(() => {
    const out: Record<string, number> = {};
    for (const w of workers) {
      if (isPaidPerDay(w)) out[w.id] = draft?.days?.[w.id] ?? seed.days[w.id] ?? 0;
    }
    return out;
  }, [workers, draft, seed]);

  const typedCompanyRevenue: number | undefined =
    draft?.companyRevenue !== undefined
      ? draft.companyRevenue ?? undefined
      : seed.companyRevenue;

  const companyRevenue = resolveCompanyRevenue(typedCompanyRevenue, workers, sales);

  const whatIf = useMemo(
    () => ({ ...seed.whatIf, ...draft?.whatIf }),
    [seed, draft],
  );

  const updateDraft = useCallback(
    (patch: (current: QuarterDraft) => QuarterDraft) => {
      const all = readDrafts();
      writeDrafts({ ...all, [period]: patch(all[period] ?? {}) });
    },
    [period],
  );

  const setSale = useCallback(
    (workerId: string, value: number) =>
      updateDraft((d) => ({ ...d, sales: { ...d.sales, [workerId]: value } })),
    [updateDraft],
  );

  const setDays = useCallback(
    (workerId: string, value: number) =>
      updateDraft((d) => ({ ...d, days: { ...d.days, [workerId]: value } })),
    [updateDraft],
  );

  /** Pass undefined to go back to "the sellers' total". */
  const setCompanyRevenue = useCallback(
    (value: number | undefined) =>
      updateDraft((d) => ({ ...d, companyRevenue: value && value > 0 ? value : null })),
    [updateDraft],
  );

  const setWhatIf = useCallback(
    (workerId: string, value: WhatIfBonus) =>
      updateDraft((d) => ({ ...d, whatIf: { ...d.whatIf, [workerId]: value } })),
    [updateDraft],
  );

  return {
    latestSaved,
    sales,
    setSale,
    days,
    setDays,
    typedCompanyRevenue,
    companyRevenue,
    setCompanyRevenue,
    whatIf,
    setWhatIf,
  };
}
