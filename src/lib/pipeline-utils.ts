import type {
  CalculationPipeline,
  PipelineRow,
  PipelineItem,
  PipelineFormData,
} from './pipeline-types';
import type { Worker } from './types';

// ============ ID Generation ============

let counter = 0;

/** Generate a unique ID for pipeline items and rows */
export function generatePipelineId(): string {
  counter++;
  return `p_${Date.now()}_${counter}_${Math.random().toString(36).slice(2, 7)}`;
}

// ============ Default Pipeline Generation ============

/**
 * Generate a default pipeline that matches the current hardcoded calculation behavior:
 * - Row 1: Both taxes (parallel, from original revenue)
 * - Row 2: All worker salaries (parallel)
 * - Row 3: All worker commissions (parallel, from post-deduction amount)
 *
 * This ensures a seamless migration: the default pipeline produces
 * the same results as calculateBonusWithGlobalInputs.
 */
export function generateDefaultPipeline(workers: Worker[]): PipelineFormData {
  const rows: PipelineRow[] = [];

  // Row 1: Both taxes (parallel — both calculated from original revenue)
  const taxRow: PipelineRow = {
    id: generatePipelineId(),
    items: [
      { id: generatePipelineId(), type: 'tax', taxIndex: 1 },
      { id: generatePipelineId(), type: 'tax', taxIndex: 2 },
    ],
  };
  rows.push(taxRow);

  // Salaries are NOT auto-added to the default pipeline anymore — the user
  // explicitly drags a salary card into the pipeline when they want a
  // worker's salary deducted from the bonus pool.

  // Row 2: All worker commissions
  const commissionItems: PipelineItem[] = workers.map(w => ({
    id: generatePipelineId(),
    type: 'worker_commission' as const,
    workerId: w.id,
  }));

  if (commissionItems.length > 0) {
    rows.push({
      id: generatePipelineId(),
      items: commissionItems,
    });
  }

  return {
    name: 'Default Pipeline',
    rows,
  };
}

// ============ Pipeline Validation ============

/** A pipeline problem, as a translation key under `pipeline.warnings` plus its values. */
export type PipelineIssue =
  | { code: 'emptyStep'; values: { step: number } }
  | { code: 'duplicateTax'; values: { index: number } }
  | { code: 'duplicateSalary'; values: { name: string } }
  | { code: 'duplicateCommission'; values: { name: string } }
  | { code: 'paidTwice'; values: { name: string } }
  | { code: 'poolMemberWithoutSales'; values: { name: string } }
  | { code: 'poolNoRate'; values: { step: number } }
  | { code: 'poolNoMembers'; values: { step: number } }
  | { code: 'missingWorker'; values: { step: number } };

export interface PipelineValidationResult {
  valid: boolean;
  warnings: PipelineIssue[];
  errors: PipelineIssue[];
}

/**
 * Validate a pipeline configuration.
 * Returns warnings for non-critical issues and errors for blocking issues.
 * People with no card at all are fine: they are paid salary only.
 */
export function validatePipeline(
  pipeline: PipelineFormData,
  workers: Worker[]
): PipelineValidationResult {
  const warnings: PipelineIssue[] = [];
  const errors: PipelineIssue[] = [];
  const workerMap = new Map(workers.map(w => [w.id, w]));
  const nameOf = (id: string) => workerMap.get(id)?.name ?? id;

  // Track item placement
  const placedTaxes = new Set<number>();
  const placedSalaries = new Set<string>();
  const placedCommissions = new Set<string>();
  const poolMembers = new Set<string>();

  pipeline.rows.forEach((row, rowIndex) => {
    const step = rowIndex + 1;
    if (row.items.length === 0) {
      warnings.push({ code: 'emptyStep', values: { step } });
    }

    for (const item of row.items) {
      // Check for duplicate tax items
      if (item.type === 'tax' && item.taxIndex) {
        if (placedTaxes.has(item.taxIndex)) {
          warnings.push({ code: 'duplicateTax', values: { index: item.taxIndex } });
        }
        placedTaxes.add(item.taxIndex);
      }

      // Check for duplicate salary items per worker
      if (item.type === 'salary' && item.workerId) {
        if (!workerMap.has(item.workerId)) {
          errors.push({ code: 'missingWorker', values: { step } });
        } else if (placedSalaries.has(item.workerId)) {
          warnings.push({ code: 'duplicateSalary', values: { name: nameOf(item.workerId) } });
        }
        placedSalaries.add(item.workerId);
      }

      // Check for duplicate commission items per worker
      if (item.type === 'worker_commission' && item.workerId) {
        if (!workerMap.has(item.workerId)) {
          errors.push({ code: 'missingWorker', values: { step } });
        } else if (placedCommissions.has(item.workerId)) {
          warnings.push({ code: 'duplicateCommission', values: { name: nameOf(item.workerId) } });
        }
        placedCommissions.add(item.workerId);
      }

      if (item.type === 'shared_pool_commission') {
        const participantIds = item.participantIds ?? [];
        if (participantIds.length === 0) {
          warnings.push({ code: 'poolNoMembers', values: { step } });
        } else if (!(item.poolRate && item.poolRate > 0)) {
          warnings.push({ code: 'poolNoRate', values: { step } });
        }
        for (const pid of participantIds) {
          const member = workerMap.get(pid);
          if (!member) {
            errors.push({ code: 'missingWorker', values: { step } });
            continue;
          }
          poolMembers.add(pid);
          // The default pool base is the members' own sales; a member
          // without an own-sales field silently adds 0.
          if (
            (item.baseSource ?? 'participants_sum') === 'participants_sum'
            && member.formula_config.revenueSource !== 'individual'
          ) {
            warnings.push({ code: 'poolMemberWithoutSales', values: { name: member.name } });
          }
        }
      }
    }
  });

  // A pool member with an own commission card is paid twice.
  for (const id of poolMembers) {
    if (placedCommissions.has(id)) {
      warnings.push({ code: 'paidTwice', values: { name: nameOf(id) } });
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

// ============ Pipeline Manipulation Helpers ============

/** Add an empty row at a specific index (or at the end) */
export function addRow(rows: PipelineRow[], atIndex?: number): PipelineRow[] {
  const newRow: PipelineRow = {
    id: generatePipelineId(),
    items: [],
  };

  const updated = [...rows];
  if (atIndex !== undefined && atIndex >= 0 && atIndex <= rows.length) {
    updated.splice(atIndex, 0, newRow);
  } else {
    updated.push(newRow);
  }
  return updated;
}

/** Remove a row by ID. Items in the row are lost. */
export function removeRow(rows: PipelineRow[], rowId: string): PipelineRow[] {
  return rows.filter(r => r.id !== rowId);
}

/** Move an item from one row to another */
export function moveItem(
  rows: PipelineRow[],
  itemId: string,
  fromRowId: string,
  toRowId: string,
  toIndex?: number
): PipelineRow[] {
  const updated = rows.map(r => ({ ...r, items: [...r.items] }));

  // Find and remove item from source row
  const sourceRow = updated.find(r => r.id === fromRowId);
  if (!sourceRow) return rows;

  const itemIndex = sourceRow.items.findIndex(i => i.id === itemId);
  if (itemIndex === -1) return rows;

  const [item] = sourceRow.items.splice(itemIndex, 1);

  // Add item to target row
  const targetRow = updated.find(r => r.id === toRowId);
  if (!targetRow) return rows;

  if (toIndex !== undefined && toIndex >= 0) {
    targetRow.items.splice(toIndex, 0, item);
  } else {
    targetRow.items.push(item);
  }

  return updated;
}

/** Add a new item to a specific row */
export function addItemToRow(
  rows: PipelineRow[],
  rowId: string,
  item: PipelineItem
): PipelineRow[] {
  return rows.map(r =>
    r.id === rowId
      ? { ...r, items: [...r.items, item] }
      : r
  );
}

/** Remove an item from its row */
export function removeItem(
  rows: PipelineRow[],
  itemId: string
): PipelineRow[] {
  return rows.map(r => ({
    ...r,
    items: r.items.filter(i => i.id !== itemId),
  }));
}

/** Update an item by id, merging the given patch into it. */
export function updateItem(
  rows: PipelineRow[],
  itemId: string,
  patch: Partial<PipelineItem>
): PipelineRow[] {
  return rows.map(r => ({
    ...r,
    items: r.items.map(i =>
      i.id === itemId ? { ...i, ...patch } : i
    ),
  }));
}

/** Find which row an item belongs to */
export function findItemRow(
  rows: PipelineRow[],
  itemId: string
): PipelineRow | undefined {
  return rows.find(r => r.items.some(i => i.id === itemId));
}

/** Reorder items within a row */
export function reorderItemsInRow(
  rows: PipelineRow[],
  rowId: string,
  fromIndex: number,
  toIndex: number
): PipelineRow[] {
  return rows.map(r => {
    if (r.id !== rowId) return r;
    const items = [...r.items];
    const [moved] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, moved);
    return { ...r, items };
  });
}

// ============ Palette Helpers ============

/** Get items that are available to place (not yet in the pipeline) */
export function getAvailablePaletteItems(
  rows: PipelineRow[],
  workers: Worker[]
): {
  taxes: { taxIndex: 1 | 2; placed: boolean }[];
  salaries: { workerId: string; workerName: string; placed: boolean }[];
  commissions: { workerId: string; workerName: string; placed: boolean }[];
} {
  // Collect all placed items
  const allItems = rows.flatMap(r => r.items);
  const placedTaxes = new Set(allItems.filter(i => i.type === 'tax').map(i => i.taxIndex));
  const placedSalaries = new Set(allItems.filter(i => i.type === 'salary').map(i => i.workerId));
  const placedCommissions = new Set(
    allItems.filter(i => i.type === 'worker_commission').map(i => i.workerId)
  );

  return {
    taxes: [
      { taxIndex: 1 as const, placed: placedTaxes.has(1) },
      { taxIndex: 2 as const, placed: placedTaxes.has(2) },
    ],
    salaries: workers
      .filter(w => (w.formula_config.salaryAmount ?? 0) > 0)
      .map(w => ({
        workerId: w.id,
        workerName: w.name,
        placed: placedSalaries.has(w.id),
      })),
    commissions: workers.map(w => ({
      workerId: w.id,
      workerName: w.name,
      placed: placedCommissions.has(w.id),
    })),
  };
}
