// ============ Pipeline Item Types ============

export type PipelineItemType = 'tax' | 'salary' | 'worker_commission' | 'custom_deduction';

/**
 * A single item in the calculation pipeline.
 *
 * Items are placed in rows. All items in the same row execute in parallel
 * (from the same starting sum). Items in different rows execute sequentially.
 */
export interface PipelineItem {
  id: string;
  type: PipelineItemType;

  /** For 'tax' items: which global tax rate to use (1 or 2) */
  taxIndex?: 1 | 2;

  /** For 'salary' and 'worker_commission' items: the worker this belongs to */
  workerId?: string;

  /** For 'custom_deduction' items: user-defined label */
  label?: string;

  /** For 'custom_deduction' items: percentage rate (e.g., 2 means 2%) */
  rate?: number;

  /** For 'custom_deduction' items: fixed dollar amount to deduct */
  fixedAmount?: number;
}

// ============ Pipeline Row ============

/**
 * A row in the pipeline.
 * All items in a row calculate from the SAME running total (parallel).
 * Between rows, deduction amounts reduce the running total (sequential).
 */
export interface PipelineRow {
  id: string;
  items: PipelineItem[];
}

// ============ Pipeline ============

/**
 * The full calculation pipeline configuration.
 * Stored as a single record in Supabase with rows as JSONB.
 */
export interface CalculationPipeline {
  id: string;
  name: string;
  rows: PipelineRow[];
  created_at: string;
  updated_at: string;
}

// ============ Execution Results ============

/** Result of executing a single pipeline item */
export interface PipelineItemResult {
  itemId: string;
  type: PipelineItemType;
  label: string;
  /** The running total this item received as input */
  inputAmount: number;
  /** How much was deducted (0 for worker_commission items) */
  deductedAmount: number;
  /** Commission earned (only for worker_commission items) */
  commissionAmount?: number;
  /** Worker name for display (salary and commission items) */
  workerName?: string;
  /** Worker ID for linking */
  workerId?: string;
  /**
   * For 'salary' items: when the card sits after the worker's commission
   * card AND salary < that prior bonus, the engine nets the salary against
   * the bonus. This field is the salary amount that was netted out (also
   * equal to deductedAmount being 0 in that case — the company has already
   * paid the cash via the bonus row).
   * For 'worker_commission' items: when a later salary netted against this
   * bonus, this is the amount netted out. Gross = commissionAmount,
   * Net = commissionAmount - nettedSalary.
   */
  nettedSalary?: number;
}

/** Result of executing an entire row */
export interface PipelineRowResult {
  rowId: string;
  rowIndex: number;
  /** Running total entering this row */
  runningTotalBefore: number;
  /** Running total after all deductions in this row */
  runningTotalAfter: number;
  /** Results for each item in the row */
  itemResults: PipelineItemResult[];
}

/** Full pipeline execution result */
export interface PipelineExecutionResult {
  startingRevenue: number;
  rowResults: PipelineRowResult[];
  finalRunningTotal: number;
  /** workerId → total commission amount (already net of any applied salary netting) */
  workerCommissions: Record<string, number>;
  /** workerId → breakdown of how commission was computed */
  workerBreakdowns: Record<string, {
    baseAmount: number;
    commissionRate: number;
    baseCommission: number;
    /** Salary amount that was netted against this worker's bonus, if any */
    nettedSalary?: number;
    totalCommission: number;
  }>;
}

// ============ Form types ============

export type PipelineFormData = Pick<CalculationPipeline, 'name' | 'rows'>;
