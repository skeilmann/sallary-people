import type { FormulaConfig, CalculationInputs, GlobalCalculationInputs } from './types';

/**
 * The entered salary may represent either a single month or the full quarter.
 * The bonus period is quarterly, so monthly amounts are multiplied by 3.
 */
export function getEffectiveSalary(config: FormulaConfig, rawSalary: number): number {
  return config.salaryPeriod === 'monthly' ? rawSalary * 3 : rawSalary;
}

/**
 * Calculate bonus based on worker's formula configuration and inputs
 *
 * The calculation follows this sequence:
 * 1. Start with base value (revenue, units sold, or profit margin)
 * 2. Subtract applicable deductions (returns, chargebacks, discounts)
 * 3. Apply commission rate as percentage of net amount
 */
export function calculateBonus(
  config: FormulaConfig,
  inputs: CalculationInputs
): number {
  // 1. Start with base value
  let netAmount = inputs.baseValue;

  // 2. Apply deductions
  for (const deduction of config.deductions) {
    const deductionValue = inputs[deduction as keyof CalculationInputs];
    if (typeof deductionValue === 'number') {
      netAmount -= deductionValue;
    }
  }

  // Ensure net amount doesn't go negative
  netAmount = Math.max(0, netAmount);

  // 3. Apply commission rate
  const bonus = netAmount * (config.commissionRate / 100);

  // Round to 2 decimal places (cents)
  return Math.round(bonus * 100) / 100;
}

/**
 * Calculate bonus with global inputs (for batch calculation on dashboard).
 *
 * Revenue source can be:
 * - 'global': Use total company revenue (shared by all workers)
 * - 'individual': Use worker's own generated revenue (entered per-worker)
 */
export function calculateBonusWithGlobalInputs(
  config: FormulaConfig,
  globalInputs: GlobalCalculationInputs,
  workerInputs?: { salary?: number; individualRevenue?: number }
): number {
  const { totalRevenue } = globalInputs;

  // Determine starting revenue based on config
  // If revenueSource is 'individual', use worker's individual revenue
  // Otherwise (default), use global total revenue
  const startingRevenue = config.revenueSource === 'individual'
    ? (workerInputs?.individualRevenue ?? 0)
    : totalRevenue;

  // Salary deduction is no longer applied here — it is decided exclusively
  // by the Pipeline (presence of a salary card). Legacy non-pipeline path
  // computes the gross commission on revenue without subtracting salary.
  const netAmount = Math.max(0, startingRevenue);

  // Apply commission rate
  const bonus = netAmount * (config.commissionRate / 100);

  return Math.round(bonus * 100) / 100;
}

/**
 * Get breakdown of calculation for display
 */
export function getCalculationBreakdown(
  config: FormulaConfig,
  globalInputs: GlobalCalculationInputs,
  workerInputs?: { salary?: number; individualRevenue?: number }
): {
  totalRevenue: number;
  isIndividualRevenue: boolean;
  /** Effective salary deducted from revenue (after ×3 if monthly). */
  salaryAmount: number;
  /** The amount as entered by the user (per month if salaryPeriod is monthly). */
  rawSalaryAmount: number;
  salaryPeriodMonthly: boolean;
  netAmount: number;
  bonusAmount: number;
} {
  const { totalRevenue } = globalInputs;

  // Determine if using individual revenue
  const isIndividualRevenue = config.revenueSource === 'individual';
  const startingRevenue = isIndividualRevenue
    ? (workerInputs?.individualRevenue ?? 0)
    : totalRevenue;

  // Salary deduction is decided by the pipeline now; the legacy breakdown
  // never deducts it. Keep the shape of the return value for compatibility.
  const rawSalaryAmount = 0;
  const salaryAmount = 0;
  const salaryPeriodMonthly = config.salaryPeriod === 'monthly';
  const netAmount = Math.max(0, startingRevenue);
  const bonusAmount = calculateBonusWithGlobalInputs(config, globalInputs, workerInputs);

  return {
    totalRevenue: startingRevenue, // Return the actual revenue used (global or individual)
    isIndividualRevenue,
    salaryAmount,
    rawSalaryAmount,
    salaryPeriodMonthly,
    netAmount: Math.round(netAmount * 100) / 100,
    bonusAmount,
  };
}

/**
 * Get the list of input fields required based on formula config
 */
export function getRequiredFields(config: FormulaConfig): string[] {
  const fields: string[] = ['baseValue'];

  // Add deduction fields that are configured
  for (const deduction of config.deductions) {
    fields.push(deduction);
  }

  return fields;
}

/**
 * Get human-readable label for a field (deprecated - use translated version)
 */
export function getFieldLabel(field: string, config: FormulaConfig): string {
  const labels: Record<string, string> = {
    baseValue: getBaseMetricLabel(config.baseMetric),
    returns: 'Returns',
    chargebacks: 'Chargebacks',
    discounts: 'Discounts',
  };

  return labels[field] || field;
}

/**
 * Get label for base metric
 */
function getBaseMetricLabel(metric: FormulaConfig['baseMetric']): string {
  const labels: Record<typeof metric, string> = {
    revenue: 'Revenue ($)',
    units_sold: 'Units Sold',
    profit_margin: 'Profit Margin ($)',
  };
  return labels[metric];
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/**
 * Calculate final amount with adjustment
 */
export function calculateFinalAmount(
  calculatedAmount: number,
  adjustmentAmount: number
): number {
  const final = calculatedAmount + adjustmentAmount;
  return Math.round(Math.max(0, final) * 100) / 100;
}

/**
 * Generate a formula description for display (deprecated - use translated version)
 */
export function describeFormula(config: FormulaConfig): string {
  const parts: string[] = [];

  // Base calculation
  parts.push(`${config.commissionRate}% of ${config.baseMetric.replace('_', ' ')}`);

  // Deductions
  if (config.deductions.length > 0) {
    parts.push(`minus ${config.deductions.join(', ')}`);
  }

  return parts.join(' ');
}

// Type for translation function
type TranslateFunction = (key: string, values?: Record<string, string | number>) => string;

/**
 * Generate a translated formula description for display
 */
export function describeFormulaTranslated(
  config: FormulaConfig,
  t: TranslateFunction
): string {
  const parts: string[] = [];

  // Base calculation
  const metricName = t(`metrics.${config.baseMetric}`);
  parts.push(`${config.commissionRate}% ${t('formula.of')} ${metricName}`);

  // Deductions
  if (config.deductions.length > 0) {
    const deductionNames = config.deductions.map(d => t(`deductionLabels.${d}`)).join(', ');
    parts.push(`${t('formula.minus')} ${deductionNames}`);
  }

  return parts.join(' ');
}

/**
 * Get translated field label
 */
export function getFieldLabelTranslated(
  field: string,
  config: FormulaConfig,
  t: TranslateFunction
): string {
  if (field === 'baseValue') {
    return t(`metrics.${config.baseMetric}`);
  }
  return t(`deductionLabels.${field}`);
}
