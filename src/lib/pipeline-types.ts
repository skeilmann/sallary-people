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

  /**
   * For 'salary' items: when true, and the card sits in a row AFTER the
   * matching worker's commission card, AND the salary amount is strictly
   * less than the commission already paid, the salary is netted against
   * the worker's bonus payout instead of deducting from the company
   * running total. If conditions are not met at execution time, the
   * engine emits an error and falls back to a normal salary deduction.
   */
  netAgainstBonus?: boolean;
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
   * For 'salary' items with netAgainstBonus=true: true when the netting was
   * actually applied (conditions met). When false/undefined, the salary
   * behaved as a normal deduction.
   */
  appliedNetting?: boolean;
  /**
   * For 'salary' items: when netting was applied, the amount subtracted
   * from the worker's previously-recorded commission.
   * For 'worker_commission' items: when a later salary netted against this
   * bonus, the amount that was netted out (gross commission =
   * commissionAmount, net = commissionAmount - nettedSalary).
   */
  nettedSalary?: number;
}

/** Pipeline execution error (e.g. invalid netAgainstBonus configuration) */
export interface PipelineError {
  /** Item that caused the error */
  itemId: string;
  /** Machine-readable error code */
  code: 'NET_NO_PRIOR_BONUS' | 'NET_SALARY_NOT_LESS_THAN_BONUS';
  /** Human-readable description (English fallback; UI may localize via code) */
  message: string;
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
  /** Validation/configuration errors raised during execution */
  errors: PipelineError[];
}

// ============ Form types ============

export type PipelineFormData = Pick<CalculationPipeline, 'name' | 'rows'>;
