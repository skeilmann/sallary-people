# Dashboard "Saved Bonuses" section

## Context

The Dashboard's "Worker Bonuses" cards always show **live** (recomputed) bonus values for the period selected at the top of the page. Once a bonus is saved, the only visible feedback is a green "Saved" pill that appears next to the card *during the same session* and disappears on refresh. To see what was actually saved for each worker, the user has to navigate to the History page, scroll through a table, and click a row to open the Calculation Details modal.

Quote from the user (2026-05-27): *"in dashboard should be displayed saved calculations in easy to understand way"*.

## Goal

Make the Dashboard answer "what was the last bonus we finalized for each worker?" without leaving the page or opening a sub-screen — while keeping the live recomputation cards intact for the current quarter's workflow.

## Scope

In scope:
- Display the **latest saved calculation per worker, across all periods** as a new compact section on the Dashboard.
- Reuse the existing Calculation Details modal for "View" interactions (extract from `CalculationHistory.tsx` so two callers share it).
- Refresh the section when a save happens on the same page.

Out of scope:
- Editing or deleting saved bonuses from the Dashboard (History page already does this).
- Showing all historical saves on the Dashboard (the timeline view stays on History).
- New database fields or migrations — the section works off the existing `calculations` rows.
- Recomputing or re-deriving the commission rate from saved data (rates can change after a save).

## Design

### Placement

A new card titled **"Saved Bonuses"** rendered between the Global Inputs card and the Worker Bonuses card grid on `src/app/page.tsx`. The Revenue Breakdown card (when visible) sits below this new card, and the existing live "Worker Bonuses" grid stays at the bottom.

### Row layout

One row per worker. Workers are ordered the same way the live cards are (current `workers` array order).

Worker WITH a saved calculation:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Kiril                                       $5,000.00      [ View ] │
│  Personal revenue $100,000 − salary $3,600 · +$1,000 adjustment      │
│  Q2 2026  ·  saved May 26, 2026                                       │
└──────────────────────────────────────────────────────────────────────┘
```

Worker WITHOUT a saved calculation:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Alice                                                                │
│  — No saved bonuses yet                                               │
└──────────────────────────────────────────────────────────────────────┘
```

Visual treatment: muted background to differentiate from the live cards below. Worker name on the left, amount on the right (large, bold). Subtitle line in muted text. Period/date line in smaller muted text.

### Subtitle composition rules

Built purely from stored data on the `Calculation` record (no worker-config look-ups, no rate × calculations).

```
Line 1 (inputs):
  if (inputs.individualRevenue is set):
    "Personal revenue {formatCurrency(individualRevenue)}"
  else:
    "Company revenue {formatCurrency(baseValue)}"

  if (inputs.salary > 0):
    append " − salary {formatCurrency(salary)}"

  if (adjustment_amount !== 0):
    append " · " + (positive ? "+" : "") + formatCurrency(adjustment_amount) + " adjustment"

Line 2 (period + date):
  "{period}  ·  saved {formatDate(created_at)}"
```

The rate is intentionally omitted. If a worker's commission rate is changed after a save, showing today's rate against yesterday's numbers misleads — `final_amount` from the database is the only authoritative value.

### Data fetching

New helper in [src/lib/supabase.ts](src/lib/supabase.ts):

```ts
export async function getLatestCalculationPerWorker(): Promise<Record<string, CalculationWithWorker>>
```

One query that returns the most recent `calculation` row per `worker_id`, joined with worker name. Implementation uses Postgres `DISTINCT ON`:

```sql
SELECT DISTINCT ON (worker_id)
  c.*, w.name as worker_name
FROM calculations c
JOIN workers w ON w.id = c.worker_id
ORDER BY worker_id, created_at DESC;
```

The function returns a map keyed by `worker_id` so the dashboard can do `latestByWorker[worker.id]` in O(1).

Called on `loadData()` in `src/app/page.tsx` alongside `getWorkers()` and `getDefaultPipeline()`. After `handleSaveBonus()` succeeds, the function is called again and the state is replaced — the just-saved row appears immediately.

### Click behaviour

The "View" button opens the existing Calculation Details modal. To enable reuse:

- Extract the modal JSX currently inside [CalculationHistory.tsx:170-220](src/components/CalculationHistory.tsx#L170-L220) into a new component **`CalculationDetailsModal.tsx`**.
- Props: `{ calculation: CalculationWithWorker | null; onClose: () => void; }` — open when `calculation` is non-null.
- `CalculationHistory.tsx` is updated to render `<CalculationDetailsModal>` instead of inline JSX, behaviour unchanged.
- The new `SavedBonusesSection.tsx` also renders it, controlled by a piece of local `useState<CalculationWithWorker | null>` for the currently viewed row.

The modal already filters out `returns`/`chargebacks`/`discounts` from the inputs display (fix shipped earlier today) — no extra change needed.

### Component breakdown

- **`SavedBonusesSection.tsx`** (new) — takes `{ workers: Worker[]; latestByWorker: Record<string, CalculationWithWorker | undefined> }`, renders the section card, the list of rows, owns the "currently-viewing" modal state.
- **`SavedBonusRow.tsx`** (new, child) — takes `{ worker: Worker; calculation?: CalculationWithWorker; onView: (calc) => void }`. Pure presentational. Encapsulates the subtitle composition.
- **`CalculationDetailsModal.tsx`** (new, extracted) — receives a `CalculationWithWorker | null` and `onClose`, renders the existing modal.
- **`getLatestCalculationPerWorker`** (new in `supabase.ts`) — single query + map shape.

### Translations

New keys under the `dashboard` namespace, added to all three locales (`en.json`, `ro.json`, `it.json`):

- `dashboard.savedBonuses` — section title ("Saved Bonuses")
- `dashboard.savedBonusesSubtitle` — "Most recent saved bonus per worker, across all periods"
- `dashboard.noSavedBonus` — "— No saved bonuses yet"
- `dashboard.savedOn` — "saved {date}" (interpolated)
- `dashboard.personalRevenue` — "Personal revenue {amount}"
- `dashboard.companyRevenue` — "Company revenue {amount}"
- `dashboard.minusSalary` — "− salary {amount}"
- `dashboard.plusAdjustment` — "+ {amount} adjustment"
- `dashboard.minusAdjustment` — "− {amount} adjustment"
- `dashboard.view` — "View"

### What this is NOT

- Not a feed of all saves (the History page already covers it).
- Not a place to edit/delete a saved bonus.
- No new database columns; no schema migration.
- No re-derivation of the commission formula — only stored data is shown.

## Files

To create:
- [src/components/SavedBonusesSection.tsx](src/components/SavedBonusesSection.tsx)
- [src/components/SavedBonusRow.tsx](src/components/SavedBonusRow.tsx)
- [src/components/CalculationDetailsModal.tsx](src/components/CalculationDetailsModal.tsx) (extracted)

To modify:
- [src/lib/supabase.ts](src/lib/supabase.ts) — add `getLatestCalculationPerWorker`
- [src/app/page.tsx](src/app/page.tsx) — load + render the new section; refresh after save
- [src/components/CalculationHistory.tsx](src/components/CalculationHistory.tsx) — use the extracted modal
- [messages/en.json](messages/en.json), [messages/ro.json](messages/ro.json), [messages/it.json](messages/it.json) — new translation keys

## Verification

1. Save a bonus for Kiril for Q2 2026 (or use the existing one). Refresh the Dashboard.
2. The "Saved Bonuses" section appears above the Worker Bonuses cards, showing Kiril's row with the correct amount, subtitle, period, and date.
3. Click **View** → existing Calculation Details modal opens with Worker / Period / Inputs (no returns/chargebacks/discounts) / Calculated / Adjustment / Final.
4. Confirm a worker with no saved calculation shows the "— No saved bonuses yet" placeholder.
5. Save a second bonus for Kiril in a different period — the row updates to the *most recent* save and the History page still lists both rows.
6. Save once more for Kiril without refreshing — section row updates without a manual reload.
