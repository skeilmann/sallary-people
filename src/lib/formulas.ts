import type { FormulaConfig, CalculationInputs, GlobalCalculationInputs } from './types';

/**
 * Calculate bonus based on worker's formula configuration and inputs
 *
 * The calculation follows this sequence:
 * 1. Start with base value (revenue, units sold, or profit margin)
 * 2. Subtract applicable deductions (returns, chargebacks, discounts)
 * 3. Apply commission rate as percentage of net amount
 * 4. Add bonus for amounts above thresholds (tiered bonus)
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

  // 3. Apply base commission rate
  let bonus = netAmount * (config.commissionRate / 100);

  // 4. Apply threshold bonuses (tiered)
  // Sort thresholds by amount (ascending) for proper tiered calculation
  const sortedThresholds = [...config.bonusThresholds].sort((a, b) => a.above - b.above);

  for (const threshold of sortedThresholds) {
    if (netAmount > threshold.above) {
      // Add extra percentage only for the amount ABOVE the threshold
      const amountAbove = netAmount - threshold.above;
      bonus += amountAbove * (threshold.extraRate / 100);
    }
  }

  // Round to 2 decimal places (cents)
  return Math.round(bonus * 100) / 100;
}

/**
 * Calculate bonus with global inputs (for batch calculation on dashboard)
 *
 * Formula for workers with salary/tax deductions (like Liuba):
 * bonus = commissionRate% × (revenue - salary - (revenue × taxRate1%) - (revenue × taxRate2%))
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
  const { totalRevenue, taxRate1, taxRate2 } = globalInputs;

  // Determine starting revenue based on config
  // If revenueSource is 'individual', use worker's individual revenue
  // Otherwise (default), use global total revenue
  const startingRevenue = config.revenueSource === 'individual'
    ? (workerInputs?.individualRevenue ?? 0)
    : totalRevenue;

  let netAmount = startingRevenue;

  // Apply salary deduction if configured (per-worker)
  if (config.deductSalary) {
    const salaryToDeduct = workerInputs?.salary ?? config.salaryAmount ?? 0;
    netAmount -= salaryToDeduct;
  }

  // Apply tax deductions if configured
  // Per-worker tax rate takes priority over global rates
  if (config.applyTaxDeductions) {
    if (config.workerTaxRate != null && config.workerTaxRate > 0) {
      // Use per-worker tax rate (applied to starting revenue)
      const taxAmount = startingRevenue * (config.workerTaxRate / 100);
      netAmount -= taxAmount;
    } else {
      // Fall back to global tax rates
      const tax1Amount = startingRevenue * (taxRate1 / 100);
      const tax2Amount = startingRevenue * (taxRate2 / 100);
      netAmount -= tax1Amount;
      netAmount -= tax2Amount;
    }
  }

  // Ensure net amount doesn't go negative
  netAmount = Math.max(0, netAmount);

  // Apply commission rate
  let bonus = netAmount * (config.commissionRate / 100);

  // Apply threshold bonuses (tiered)
  const sortedThresholds = [...config.bonusThresholds].sort((a, b) => a.above - b.above);

  for (const threshold of sortedThresholds) {
    if (netAmount > threshold.above) {
      const amountAbove = netAmount - threshold.above;
      bonus += amountAbove * (threshold.extraRate / 100);
    }
  }

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
  tax1Amount: number;
  tax2Amount: number;
  workerTaxAmount: number;
  salaryAmount: number;
  netAmount: number;
  bonusAmount: number;
} {
  const { totalRevenue, taxRate1, taxRate2 } = globalInputs;

  // Determine if using individual revenue
  const isIndividualRevenue = config.revenueSource === 'individual';
  const startingRevenue = isIndividualRevenue
    ? (workerInputs?.individualRevenue ?? 0)
    : totalRevenue;

  let netAmount = startingRevenue;
  let tax1Amount = 0;
  let tax2Amount = 0;
  let workerTaxAmount = 0;
  let salaryAmount = 0;

  // Salary first (matches calculation order in calculateBonusWithGlobalInputs)
  if (config.deductSalary) {
    salaryAmount = workerInputs?.salary ?? config.salaryAmount ?? 0;
    netAmount -= salaryAmount;
  }

  // Tax deductions
  if (config.applyTaxDeductions) {
    if (config.workerTaxRate != null && config.workerTaxRate > 0) {
      workerTaxAmount = startingRevenue * (config.workerTaxRate / 100);
      netAmount -= workerTaxAmount;
    } else {
      tax1Amount = startingRevenue * (taxRate1 / 100);
      tax2Amount = startingRevenue * (taxRate2 / 100);
      netAmount -= tax1Amount;
      netAmount -= tax2Amount;
    }
  }

  netAmount = Math.max(0, netAmount);
  const bonusAmount = calculateBonusWithGlobalInputs(config, globalInputs, workerInputs);

  return {
    totalRevenue: startingRevenue, // Return the actual revenue used (global or individual)
    isIndividualRevenue,
    tax1Amount: Math.round(tax1Amount * 100) / 100,
    tax2Amount: Math.round(tax2Amount * 100) / 100,
    workerTaxAmount: Math.round(workerTaxAmount * 100) / 100,
    salaryAmount,
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

  // Thresholds
  if (config.bonusThresholds.length > 0) {
    const thresholdDesc = config.bonusThresholds
      .map(t => `+${t.extraRate}% above $${t.above.toLocaleString()}`)
      .join(', ');
    parts.push(thresholdDesc);
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

  // Thresholds
  if (config.bonusThresholds.length > 0) {
    const thresholdDesc = config.bonusThresholds
      .map(threshold => `+${threshold.extraRate}% ${t('formula.above')} $${threshold.above.toLocaleString()}`)
      .join(', ');
    parts.push(thresholdDesc);
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
