// ============ Pipeline Item Types ============

export type PipelineItemType =
  | 'tax'
  | 'salary'
  | 'worker_commission'
  | 'custom_deduction'
  | 'shared_pool_commission';

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

  /** For 'shared_pool_commission' items: percentage of running total that
   *  forms the shared bonus pool (e.g., 8 means 8%). */
  poolRate?: number;

  /** For 'shared_pool_commission' items: worker IDs that share the pool
   *  equally. Each participant receives `netPool / participants.length`. */
  participantIds?: string[];

  /** For 'shared_pool_commission' items: when true, sum of participants'
   *  quarterly salaries is subtracted from the pool before splitting. */
  deductParticipantSalaries?: boolean;

  /** For 'shared_pool_commission' items: what value the poolRate is applied to.
   *  - 'pipeline' (default): the pipeline's running total at this card's row
   *    (company-wide, reduced by any taxes/expenses placed above).
   *  - 'participants_sum': sum of each participant's individualRevenue input.
   *    Use this when the team's bonus is funded from their own combined sales
   *    rather than the company's total revenue.
   *  Undefined behaves as 'pipeline' for backward compatibility. */
  baseSource?: 'pipeline' | 'participants_sum';
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
  /**
   * For 'salary' items that did NOT meet the auto-netting condition
   * (no prior bonus, or salary >= prior bonus): the salary amount that was
   * instead credited to the worker's total payout. The company still pays it
   * via `deductedAmount`, but the worker's recorded commission grows by this
   * amount so the dashboard reflects bonus + salary.
   */
  addedSalary?: number;

  /** For 'shared_pool_commission' items: the value that poolRate was applied
   *  to. Equals `inputAmount` when baseSource is 'pipeline' (or unset), and
   *  the sum of participants' individualRevenue when baseSource is
   *  'participants_sum'. */
  poolBase?: number;
  /** For 'shared_pool_commission' items: which value `poolBase` came from. */
  poolBaseSource?: 'pipeline' | 'participants_sum';
  /** For 'shared_pool_commission' items: gross pool (poolBase × poolRate / 100). */
  poolAmount?: number;
  /** For 'shared_pool_commission' items: total quarterly salaries subtracted
   *  from the pool when `deductParticipantSalaries` is on. */
  poolSalaryDeducted?: number;
  /** For 'shared_pool_commission' items: net pool after salary deduction. */
  netPool?: number;
  /** For 'shared_pool_commission' items: per-participant share (netPool / N). */
  perPerson?: number;
  /** For 'shared_pool_commission' items: participant names for display. */
  participantNames?: string[];
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
  /**
   * workerId → total worker payout (commission, net of any auto-netted salary,
   * plus any non-netted salary added on top).
   */
  workerCommissions: Record<string, number>;
  /** workerId → breakdown of how commission was computed */
  workerBreakdowns: Record<string, {
    baseAmount: number;
    commissionRate: number;
    baseCommission: number;
    /** Salary amount that was netted against this worker's bonus, if any */
    nettedSalary?: number;
    /** Salary amount that was added on top of this worker's bonus, if any */
    addedSalary?: number;
    totalCommission: number;
  }>;
}

// ============ Form types ============

export type PipelineFormData = Pick<CalculationPipeline, 'name' | 'rows'>;
