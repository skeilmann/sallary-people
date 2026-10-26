import { describe, expect, it } from 'vitest';
import { formatSalary, getEffectiveSalary, getQuarterSalaryInOwnCurrency, RON_PER_EUR } from './formulas';
import type { FormulaConfig } from './types';

const config = (patch: Partial<FormulaConfig>): FormulaConfig => ({
  baseMetric: 'revenue',
  commissionRate: 0,
  deductions: [],
  ...patch,
});

describe('quarter salary', () => {
  it('counts a monthly salary three times and a daily one per day worked', () => {
    expect(getEffectiveSalary(config({ salaryPeriod: 'monthly' }), 1_450)).toBe(4_350);
    expect(getEffectiveSalary(config({ salaryPeriod: 'quarterly' }), 4_000)).toBe(4_000);
    expect(getEffectiveSalary(config({ salaryPeriod: 'daily' }), 100, 22)).toBe(2_200);
  });

  it('converts a salary in lei to euro at the fixed rate', () => {
    expect(RON_PER_EUR).toBe(5.1);
    const ron = config({ salaryPeriod: 'monthly', salaryCurrency: 'RON' });
    expect(getQuarterSalaryInOwnCurrency(ron, 2_550)).toBe(7_650);
    expect(getEffectiveSalary(ron, 2_550)).toBe(1_500); // 7,650 / 5.1
    expect(getEffectiveSalary(config({ salaryPeriod: 'daily', salaryCurrency: 'RON' }), 275, 25)).toBe(1_348.04);
  });

  it('shows a salary in its own currency', () => {
    // Intl puts a non-breaking space after the currency code.
    expect(formatSalary(config({ salaryCurrency: 'RON' }), 275).replace(/\s/g, ' ')).toBe('RON 275.00');
    expect(formatSalary(config({}), 1_450)).toBe('€1,450.00');
  });
});
