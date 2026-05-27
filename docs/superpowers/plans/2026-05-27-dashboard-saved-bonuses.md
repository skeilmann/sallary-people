# Dashboard "Saved Bonuses" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Saved Bonuses" section to the Dashboard that shows the most recent saved bonus per worker (across all periods), with an extracted reusable Calculation Details modal.

**Architecture:** Three new presentational components (`SavedBonusesSection`, `SavedBonusRow`, `CalculationDetailsModal`) plus one new data helper (`getLatestCalculationPerWorker`). The detail modal is extracted from `CalculationHistory.tsx` so both pages share it. The dashboard loads the latest-per-worker map once on mount and re-fetches after every save.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Tailwind CSS, Radix UI primitives via shadcn-style wrappers, TypeScript. Data persistence is **localStorage** (the file is named `supabase.ts` but the implementation reads/writes localStorage — keep that pattern). No test framework is installed; verification is `npx tsc --noEmit` + manual browser checks.

**Spec:** [docs/superpowers/specs/2026-05-27-dashboard-saved-bonuses-design.md](../specs/2026-05-27-dashboard-saved-bonuses-design.md)

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/components/CalculationDetailsModal.tsx` | Create | Reusable modal: shows worker/period/inputs/calculated/adjustment/final for one calculation |
| `src/components/CalculationHistory.tsx` | Modify | Use the extracted modal instead of inline JSX |
| `src/lib/supabase.ts` | Modify | Add `getLatestCalculationPerWorker()` |
| `src/components/SavedBonusRow.tsx` | Create | One presentational row: name, amount, subtitle, View button, or empty-state placeholder |
| `src/components/SavedBonusesSection.tsx` | Create | Section card + list of rows + owns the "currently-viewing" modal state |
| `src/app/page.tsx` | Modify | Load latest-per-worker, render the section, refresh after `handleSaveBonus` |
| `messages/en.json` | Modify | New `dashboard.savedBonuses.*` keys |
| `messages/ro.json` | Modify | Same keys, Romanian |
| `messages/it.json` | Modify | Same keys, Italian |

---

## Task 1: Extract `CalculationDetailsModal` from `CalculationHistory.tsx`

This is a pure refactor — no behavioral change. Verifies cleanly.

**Files:**
- Create: `src/components/CalculationDetailsModal.tsx`
- Modify: `src/components/CalculationHistory.tsx`

- [ ] **Step 1: Create the new file with the extracted JSX**

Write `src/components/CalculationDetailsModal.tsx`:

```tsx
'use client';

import { useTranslations, useLocale } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CalculationWithWorker } from '@/lib/types';
import { formatCurrency } from '@/lib/formulas';

interface CalculationDetailsModalProps {
  calculation: CalculationWithWorker | null;
  onClose: () => void;
}

export function CalculationDetailsModal({
  calculation,
  onClose,
}: CalculationDetailsModalProps) {
  const t = useTranslations('history');
  const locale = useLocale();

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  return (
    <Dialog open={!!calculation} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('detail.title')}</DialogTitle>
        </DialogHeader>
        {calculation && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{t('detail.worker')}</p>
                <p className="font-medium">{calculation.worker?.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('detail.period')}</p>
                <p className="font-medium">{calculation.period}</p>
              </div>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">{t('detail.inputs')}</p>
              <div className="bg-muted p-3 rounded space-y-1">
                {Object.entries(calculation.inputs)
                  .filter(([key]) => key !== 'returns' && key !== 'chargebacks' && key !== 'discounts')
                  .map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="capitalize">{key.replace('_', ' ')}</span>
                      <span>{typeof value === 'number' ? formatCurrency(value) : value}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div>
                <p className="text-sm text-muted-foreground">{t('detail.calculated')}</p>
                <p className="font-medium">{formatCurrency(calculation.calculated_amount)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('detail.adjustment')}</p>
                <p
                  className={`font-medium ${
                    calculation.adjustment_amount > 0
                      ? 'text-green-600'
                      : calculation.adjustment_amount < 0
                      ? 'text-red-600'
                      : ''
                  }`}
                >
                  {calculation.adjustment_amount !== 0
                    ? `${calculation.adjustment_amount > 0 ? '+' : ''}${formatCurrency(
                        calculation.adjustment_amount,
                      )}`
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('detail.final')}</p>
                <p className="text-lg font-bold">{formatCurrency(calculation.final_amount)}</p>
              </div>
            </div>

            {calculation.adjustment_note && (
              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground">{t('detail.adjustmentNote')}</p>
                <p className="text-sm mt-1 p-2 bg-muted rounded">{calculation.adjustment_note}</p>
              </div>
            )}

            <div className="text-xs text-muted-foreground pt-2">
              {t('detail.calculatedOn', { date: formatDate(calculation.created_at) })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Replace inline JSX in `CalculationHistory.tsx` with the new component**

In `src/components/CalculationHistory.tsx`:

1. Remove the now-unused `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` imports (lines 15-20).
2. Add the import:

```tsx
import { CalculationDetailsModal } from './CalculationDetailsModal';
```

3. Replace the entire `{/* Detail Modal */}` block at lines 158-225 with:

```tsx
<CalculationDetailsModal
  calculation={detailCalc}
  onClose={() => setDetailCalc(null)}
/>
```

The `formatDate` local helper at lines 53-59 in `CalculationHistory.tsx` is also used by the table rows, so leave it in place (don't remove it).

- [ ] **Step 3: Type-check**

Run:

```bash
cd /Users/cazacug/Development/salary/bonus-calculator
npx tsc --noEmit
```

Expected: no output (clean exit code).

- [ ] **Step 4: Manual browser verification**

Make sure `npm run dev` is running (port 3000). Navigate to `http://localhost:3000/sallary-people/history/` and click **View** on any row. The Calculation Details modal must open and show: Worker, Period, Inputs (only `baseValue`, plus `salary`/`individualRevenue` when present — no returns/chargebacks/discounts), Calculated, Adjustment, Final, and "Calculated on ..." footer. Close it with the X button. Behavior must be identical to before this task.

- [ ] **Step 5: Commit**

```bash
cd /Users/cazacug/Development/salary/bonus-calculator
git add src/components/CalculationDetailsModal.tsx src/components/CalculationHistory.tsx
git commit -m "refactor: extract CalculationDetailsModal from CalculationHistory"
```

---

## Task 2: Add `getLatestCalculationPerWorker` to `supabase.ts`

**Files:**
- Modify: `src/lib/supabase.ts` (data layer is localStorage — keep the existing array-read pattern)

- [ ] **Step 1: Add the helper function**

Append the following after the existing `getRecentCalculations` function in `src/lib/supabase.ts`:

```ts
/**
 * Returns the most recent calculation for each worker, keyed by worker_id.
 * Workers with no saved calculations are absent from the result — callers
 * must treat lookups as possibly undefined, hence the `| undefined` value type.
 * Used by the Dashboard "Saved Bonuses" section.
 */
export async function getLatestCalculationPerWorker(): Promise<
  Record<string, CalculationWithWorker | undefined>
> {
  const calculations = readArray<Calculation>(CALCULATIONS_KEY);
  const workers = readArray<Worker>(WORKERS_KEY);
  const workersById = new Map(workers.map((w) => [w.id, w]));

  // Most recent first, then keep the first one we see per worker.
  const sorted = [...calculations].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  );

  const latestByWorker: Record<string, CalculationWithWorker | undefined> = {};
  for (const calc of sorted) {
    if (latestByWorker[calc.worker_id]) continue;
    latestByWorker[calc.worker_id] = attachWorker(calc, workersById);
  }
  return latestByWorker;
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/cazacug/Development/salary/bonus-calculator
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "feat(supabase): add getLatestCalculationPerWorker"
```

---

## Task 3: Add translation keys to en / ro / it

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/ro.json`
- Modify: `messages/it.json`

Find the `"dashboard": { ... }` namespace in each file and add the keys below at the end of that object (before the closing `}` of the dashboard block). If the order matters for diff readability, place them after the existing `"workerBonuses"` key.

- [ ] **Step 1: Add to `messages/en.json`**

Inside the `dashboard` namespace, add:

```json
"savedBonuses": "Saved Bonuses",
"savedBonusesSubtitle": "Most recent saved bonus per worker, across all periods",
"noSavedBonus": "— No saved bonuses yet",
"savedOn": "saved {date}",
"personalRevenueLine": "Personal revenue {amount}",
"companyRevenueLine": "Company revenue {amount}",
"minusSalary": "− salary {amount}",
"plusAdjustment": "· +{amount} adjustment",
"minusAdjustment": "· −{amount} adjustment",
"viewDetails": "View"
```

- [ ] **Step 2: Add to `messages/ro.json`**

```json
"savedBonuses": "Bonusuri Salvate",
"savedBonusesSubtitle": "Cel mai recent bonus salvat per angajat, pe toate perioadele",
"noSavedBonus": "— Niciun bonus salvat încă",
"savedOn": "salvat {date}",
"personalRevenueLine": "Venit personal {amount}",
"companyRevenueLine": "Venit companie {amount}",
"minusSalary": "− salariu {amount}",
"plusAdjustment": "· +{amount} ajustare",
"minusAdjustment": "· −{amount} ajustare",
"viewDetails": "Vezi"
```

- [ ] **Step 3: Add to `messages/it.json`**

```json
"savedBonuses": "Bonus Salvati",
"savedBonusesSubtitle": "Bonus salvato più recente per dipendente, per tutti i periodi",
"noSavedBonus": "— Nessun bonus salvato ancora",
"savedOn": "salvato il {date}",
"personalRevenueLine": "Fatturato personale {amount}",
"companyRevenueLine": "Fatturato aziendale {amount}",
"minusSalary": "− stipendio {amount}",
"plusAdjustment": "· +{amount} aggiustamento",
"minusAdjustment": "· −{amount} aggiustamento",
"viewDetails": "Visualizza"
```

- [ ] **Step 4: Validate JSON**

```bash
cd /Users/cazacug/Development/salary/bonus-calculator
node -e "['en','ro','it'].forEach(l => JSON.parse(require('fs').readFileSync('messages/'+l+'.json','utf8')))"
```

Expected: no output. (Any syntax error throws and shows the locale.)

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/ro.json messages/it.json
git commit -m "i18n: add dashboard.savedBonuses translation keys"
```

---

## Task 4: Create `SavedBonusRow.tsx`

Pure presentational component. Owns no state. Composes the subtitle from stored data.

**Files:**
- Create: `src/components/SavedBonusRow.tsx`

- [ ] **Step 1: Create the file**

Write `src/components/SavedBonusRow.tsx`:

```tsx
'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { Worker, CalculationWithWorker } from '@/lib/types';
import { formatCurrency } from '@/lib/formulas';

interface SavedBonusRowProps {
  worker: Worker;
  calculation: CalculationWithWorker | undefined;
  onView: (calc: CalculationWithWorker) => void;
}

export function SavedBonusRow({ worker, calculation, onView }: SavedBonusRowProps) {
  const t = useTranslations('dashboard');
  const locale = useLocale();

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  // Empty state: worker has no saved calculation yet.
  if (!calculation) {
    return (
      <div className="flex items-baseline justify-between gap-4 rounded-lg border border-dashed bg-muted/30 px-4 py-3">
        <div>
          <p className="font-medium">{worker.name}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{t('noSavedBonus')}</p>
        </div>
      </div>
    );
  }

  // Compose the inputs line from stored data.
  const inputs = calculation.inputs;
  const isIndividual = inputs.individualRevenue !== undefined && inputs.individualRevenue !== null;
  const baseValueLine = isIndividual
    ? t('personalRevenueLine', { amount: formatCurrency(inputs.individualRevenue ?? 0) })
    : t('companyRevenueLine', { amount: formatCurrency(inputs.baseValue ?? 0) });

  const salaryLine =
    inputs.salary !== undefined && inputs.salary > 0
      ? ` ${t('minusSalary', { amount: formatCurrency(inputs.salary) })}`
      : '';

  const adj = calculation.adjustment_amount;
  let adjustmentLine = '';
  if (adj > 0) {
    adjustmentLine = ` ${t('plusAdjustment', { amount: formatCurrency(adj) })}`;
  } else if (adj < 0) {
    adjustmentLine = ` ${t('minusAdjustment', { amount: formatCurrency(Math.abs(adj)) })}`;
  }

  const subtitle = `${baseValueLine}${salaryLine}${adjustmentLine}`;
  const periodAndDate = `${calculation.period}  ·  ${t('savedOn', {
    date: formatDate(calculation.created_at),
  })}`;

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium">{worker.name}</p>
        <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>
        <p className="text-xs text-muted-foreground mt-1">{periodAndDate}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-lg font-bold tabular-nums">
          {formatCurrency(calculation.final_amount)}
        </span>
        <Button variant="outline" size="sm" onClick={() => onView(calculation)}>
          {t('viewDetails')}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/cazacug/Development/salary/bonus-calculator
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/SavedBonusRow.tsx
git commit -m "feat(dashboard): add SavedBonusRow component"
```

---

## Task 5: Create `SavedBonusesSection.tsx`

Owns the modal-open state. Renders the section card with title, subtitle, and one row per worker.

**Files:**
- Create: `src/components/SavedBonusesSection.tsx`

- [ ] **Step 1: Create the file**

Write `src/components/SavedBonusesSection.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SavedBonusRow } from './SavedBonusRow';
import { CalculationDetailsModal } from './CalculationDetailsModal';
import type { Worker, CalculationWithWorker } from '@/lib/types';

interface SavedBonusesSectionProps {
  workers: Worker[];
  latestByWorker: Record<string, CalculationWithWorker | undefined>;
}

export function SavedBonusesSection({
  workers,
  latestByWorker,
}: SavedBonusesSectionProps) {
  const t = useTranslations('dashboard');
  const [viewing, setViewing] = useState<CalculationWithWorker | null>(null);

  if (workers.length === 0) return null;

  return (
    <>
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>{t('savedBonuses')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('savedBonusesSubtitle')}</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {workers.map((worker) => (
              <SavedBonusRow
                key={worker.id}
                worker={worker}
                calculation={latestByWorker[worker.id]}
                onView={(calc) => setViewing(calc)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <CalculationDetailsModal
        calculation={viewing}
        onClose={() => setViewing(null)}
      />
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/cazacug/Development/salary/bonus-calculator
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/SavedBonusesSection.tsx
git commit -m "feat(dashboard): add SavedBonusesSection component"
```

---

## Task 6: Wire `SavedBonusesSection` into the Dashboard

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add the import**

In `src/app/page.tsx`, add to the existing imports near the top of the file (with the other component imports around line 19-20):

```tsx
import { SavedBonusesSection } from '@/components/SavedBonusesSection';
```

Also add to the import of helpers from `@/lib/supabase` (currently around line 23). The existing line:

```tsx
import { getWorkers, createCalculation, getCalculation, getDefaultPipeline } from '@/lib/supabase';
```

becomes:

```tsx
import {
  getWorkers,
  createCalculation,
  getCalculation,
  getDefaultPipeline,
  getLatestCalculationPerWorker,
} from '@/lib/supabase';
```

Add the type import on the existing line that imports types from `@/lib/types` (around line 21):

```tsx
import type { Worker, GlobalCalculationInputs, Quarter, CalculationInputs, CalculationWithWorker } from '@/lib/types';
```

(`CalculationWithWorker` is already imported — verify it's there; if not, add it.)

- [ ] **Step 2: Add the state hook**

In the `DashboardPage` component, alongside the existing `useState` hooks (e.g., next to `const [pipeline, setPipeline] = useState<CalculationPipeline | null>(null);` around line 43), add:

```tsx
const [latestByWorker, setLatestByWorker] = useState<
  Record<string, CalculationWithWorker | undefined>
>({});
```

- [ ] **Step 3: Fetch the data on load**

In `loadData()` (around line 91), extend the `Promise.all` call. Current code:

```tsx
const [workersData, pipelineData] = await Promise.all([
  getWorkers(),
  getDefaultPipeline().catch(() => null),
]);
setWorkers(workersData);
setPipeline(pipelineData);
```

Becomes:

```tsx
const [workersData, pipelineData, latestData] = await Promise.all([
  getWorkers(),
  getDefaultPipeline().catch(() => null),
  getLatestCalculationPerWorker(),
]);
setWorkers(workersData);
setPipeline(pipelineData);
setLatestByWorker(latestData);
```

The `.catch(() => null)` on `getDefaultPipeline` is kept as-is (pipeline may legitimately not exist). The latest-per-worker call has no fallback — if it throws, the outer `try/catch` in `loadData()` logs the error and the dashboard stays in `loading: false` with empty state, identical to the existing behaviour for a `getWorkers()` failure.

- [ ] **Step 4: Refresh after a successful save**

In `handleSaveBonus()` (around line 163), at the end of the `try` block — right after the existing `setSavedWorkerIds(...)` line — add:

```tsx
// Refresh the "Saved Bonuses" section so the just-saved row appears immediately.
const refreshed = await getLatestCalculationPerWorker().catch(() => null);
if (refreshed) setLatestByWorker(refreshed);
```

So that block reads:

```tsx
await createCalculation({ /* ... unchanged ... */ });
setSavedWorkerIds((prev) => new Set([...prev, data.workerId]));
const refreshed = await getLatestCalculationPerWorker().catch(() => null);
if (refreshed) setLatestByWorker(refreshed);
```

- [ ] **Step 5: Render the new section between Global Inputs and Revenue Breakdown / Worker Bonuses**

Find the closing `</Card>` of the Global Inputs card (the one with `CardTitle` value `t('globalInputs')` — around line 395-396). Immediately after it, add:

```tsx
{/* Saved Bonuses (most recent per worker, across all periods) */}
{workers.length > 0 && (
  <SavedBonusesSection workers={workers} latestByWorker={latestByWorker} />
)}
```

This places the new section above the existing "Revenue Breakdown" card (which is conditional) and above the live "Worker Bonuses" grid.

- [ ] **Step 6: Type-check**

```bash
cd /Users/cazacug/Development/salary/bonus-calculator
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 7: Build**

```bash
cd /Users/cazacug/Development/salary/bonus-calculator
npm run build
```

Expected: build completes successfully. Watch for any "Module not found" or unused-import warnings — fix them before committing.

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(dashboard): render SavedBonusesSection above worker cards"
```

---

## Task 7: End-to-end browser verification

No code change in this task — just verifying the full flow works.

**Files:** none

- [ ] **Step 1: Start dev server**

```bash
cd /Users/cazacug/Development/salary/bonus-calculator
npm run dev
```

Wait until `Ready` appears. If port 3000 is occupied by an earlier dev server, the existing instance is fine — use it.

- [ ] **Step 2: Navigate to Dashboard**

Open `http://localhost:3000/sallary-people/` in a browser. Confirm the page order top-to-bottom:

1. Page title "Bonus Calculator"
2. **Calculation Inputs** card (Period, Total Revenue, Tax Rate 1, Tax Rate 2, Total Bonuses, Final Revenue)
3. **Saved Bonuses** card (NEW) — title + subtitle + one row per worker
4. Worker Bonuses heading + the live cards grid
5. Manage Workers / View History buttons

- [ ] **Step 3: Verify a worker WITH a saved calculation**

If Kiril has at least one saved calculation in History, his row in "Saved Bonuses" must show:

- Worker name: `Kiril`
- Amount (right-aligned, bold): the saved `final_amount`
- Subtitle: `Personal revenue $X − salary $Y` (or `Company revenue $X` if global mode); if there was an adjustment, ` · +$Z adjustment` or ` · −$Z adjustment`
- Period + date: `Q2 2026  ·  saved May 26, 2026` (or whatever the actual values are)
- A `View` button

Clicking **View** opens the Calculation Details modal with the same data the History page modal shows.

- [ ] **Step 4: Verify a worker WITHOUT a saved calculation**

Add a new worker on the Workers page (e.g., "Alice") and return to the Dashboard. Alice's row in "Saved Bonuses" must show:

- Worker name: `Alice`
- Subtitle (no amount, no View button): `— No saved bonuses yet`
- Visual treatment: dashed border / lighter background so the empty state reads as different from a populated row.

- [ ] **Step 5: Verify the post-save refresh**

Enter a value in the dashboard inputs, click **Save Bonus** on Alice's live card, complete the modal, hit **Save Bonus**. Without refreshing the page, scroll up — Alice's row in "Saved Bonuses" must now show the saved amount, subtitle, period, and date, replacing the placeholder.

- [ ] **Step 6: Verify multiple saves keep the latest**

For a worker with an existing save, save again with a different amount or in a different period. The "Saved Bonuses" row updates to show the new (most recent) save. Visit the History page — both saves are still present in the table.

- [ ] **Step 7: Locale check**

Switch the locale to Romanian (top-right combobox). Confirm the section title becomes "Bonusuri Salvate", the subtitle and all row strings are in Romanian. Repeat for Italian.

- [ ] **Step 8: Final commit (none expected)**

If everything above passes, there is no code change in this task — just close it. If a fix is needed, make it, type-check, and add a commit named for the specific fix.

---

## Verification summary

When all 7 tasks pass:

- `npx tsc --noEmit` is clean.
- `npm run build` succeeds.
- The Dashboard shows a "Saved Bonuses" section between Global Inputs and Worker Bonuses, with one row per worker.
- Workers without saves show a "— No saved bonuses yet" placeholder.
- Workers with saves show amount, subtitle (inputs + adjustment when present), period, save date, and a View button that opens the existing Calculation Details modal.
- After a save on the live cards, the section updates in place (no manual refresh).
- All three locales render correctly.
- The History page modal is unchanged in behaviour (now uses the extracted modal component).
