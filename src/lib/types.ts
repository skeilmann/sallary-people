// Formula configuration stored in worker profile
export interface FormulaConfig {
  baseMetric: 'revenue' | 'units_sold' | 'profit_margin';
  commissionRate: number; // percentage (e.g., 8 means 8%)
  deductions: ('returns' | 'chargebacks' | 'discounts')[];
  bonusThresholds: BonusThreshold[];
  // Salary deduction (per-worker amount)
  deductSalary?: boolean;
  salaryAmount?: number;
  // Period the entered salaryAmount represents. 'quarterly' = full quarter (current behaviour);
  // 'monthly' = per-month amount that gets multiplied ×3 for the quarterly bonus calc.
  // Defaults to 'quarterly' to keep existing workers unchanged.
  salaryPeriod?: 'monthly' | 'quarterly';
  // Apply tax deductions before commission calculation
  applyTaxDeductions?: boolean;
  // Per-worker tax rate (percentage). When set, overrides global taxRate1+taxRate2.
  // e.g., 32 means 32% of revenue is deducted as tax.
  workerTaxRate?: number;
  // Revenue source: 'global' (total company revenue) or 'individual' (worker's own sales)
  revenueSource?: 'global' | 'individual';
}

export interface BonusThreshold {
  above: number; // threshold amount
  extraRate: number; // additional percentage for amount above threshold
}

// Inputs provided during calculation
export interface CalculationInputs {
  baseValue: number;
  returns?: number;
  chargebacks?: number;
  discounts?: number;
  // Per-worker salary override (optional)
  salary?: number;
  // Individual revenue (when worker uses 'individual' revenue source)
  individualRevenue?: number;
}

// Global inputs for batch calculation (entered once, used for all workers)
export interface GlobalCalculationInputs {
  totalRevenue: number;
  taxRate1: number; // First tax percentage
  taxRate2: number; // Second tax percentage
}

// Worker profile
export interface Worker {
  id: string;
  name: string;
  formula_config: FormulaConfig;
  created_at: string;
  updated_at: string;
}

// Calculation record
export interface Calculation {
  id: string;
  worker_id: string;
  period: string;
  inputs: CalculationInputs;
  calculated_amount: number;
  adjustment_amount: number;
  adjustment_note: string | null;
  final_amount: number;
  created_at: string;
}

// Calculation with worker info for display
export interface CalculationWithWorker extends Calculation {
  worker: Pick<Worker, 'id' | 'name'>;
}

// Form types for creating/editing
export type WorkerFormData = Omit<Worker, 'id' | 'created_at' | 'updated_at'>;
export type CalculationFormData = Omit<Calculation, 'id' | 'created_at' | 'final_amount'>;

// Period helper type
export type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export function generatePeriod(quarter: Quarter, year: number): string {
  return `${quarter} ${year}`;
}

export function getCurrentQuarter(): Quarter {
  const month = new Date().getMonth();
  if (month < 3) return 'Q1';
  if (month < 6) return 'Q2';
  if (month < 9) return 'Q3';
  return 'Q4';
}

export function getCurrentYear(): number {
  return new Date().getFullYear();
}

// Default formula config for new workers
export const defaultFormulaConfig: FormulaConfig = {
  baseMetric: 'revenue',
  commissionRate: 5,
  deductions: [],
  bonusThresholds: [],
  deductSalary: false,
  salaryAmount: 0,
  salaryPeriod: 'quarterly',
  applyTaxDeductions: false,
  workerTaxRate: undefined,
  revenueSource: 'global',
};

// Human-readable labels for metrics
export const baseMetricLabels: Record<FormulaConfig['baseMetric'], string> = {
  revenue: 'Revenue',
  units_sold: 'Units Sold',
  profit_margin: 'Profit Margin',
};

export const deductionLabels: Record<FormulaConfig['deductions'][number], string> = {
  returns: 'Returns',
  chargebacks: 'Chargebacks',
  discounts: 'Discounts',
};
