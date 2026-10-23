// Shared builders for unit tests. Not imported by app code.
import type { FormulaConfig, Worker } from './types';
import type { CalculationPipeline, PipelineItem } from './pipeline-types';

export function makeWorker(
  id: string,
  config: Partial<FormulaConfig> & Pick<FormulaConfig, 'commissionRate'>,
): Worker {
  return {
    id,
    name: id,
    created_at: '',
    updated_at: '',
    formula_config: {
      baseMetric: 'revenue',
      deductions: [],
      salaryAmount: 0,
      salaryPeriod: 'quarterly',
      revenueSource: 'global',
      ...config,
    },
  };
}

/** Each inner array is one pipeline step (row). Item ids are generated. */
export function makePipeline(steps: Omit<PipelineItem, 'id'>[][]): CalculationPipeline {
  return {
    id: 'pipeline',
    name: 'Test pipeline',
    created_at: '',
    updated_at: '',
    rows: steps.map((items, rowIndex) => ({
      id: `row${rowIndex}`,
      items: items.map((item, itemIndex) => ({ ...item, id: `row${rowIndex}-item${itemIndex}` })),
    })),
  };
}

// The company's real setup: a two-person sales team sharing a pool, a solo
// seller on his own sales, a manager on all company sales, and two people on
// salary only.
export const kiril = makeWorker('Kiril', {
  commissionRate: 4, salaryAmount: 1450, salaryPeriod: 'monthly', revenueSource: 'individual',
});
export const liuba = makeWorker('Liuba', {
  commissionRate: 4, salaryAmount: 550, salaryPeriod: 'monthly', revenueSource: 'individual',
});
export const costea = makeWorker('Costea', { commissionRate: 10, revenueSource: 'individual' });
// Paid per day worked (the rate here is made up for the tests).
export const george = makeWorker('George', { commissionRate: 1, salaryAmount: 120, salaryPeriod: 'daily' });
export const francesca = makeWorker('Francesca', { commissionRate: 0, salaryAmount: 1200, salaryPeriod: 'monthly' });
export const lorenzo = makeWorker('Lorenzo', { commissionRate: 0, salaryAmount: 1000, salaryPeriod: 'monthly' });

export const companyWorkers = [costea, francesca, george, kiril, liuba, lorenzo];

export const teamPool: Omit<PipelineItem, 'id'> = {
  type: 'shared_pool_commission',
  label: 'Sales team',
  poolRate: 8,
  participantIds: ['Kiril', 'Liuba'],
  baseSource: 'participants_sum',
  deductParticipantSalaries: true,
};

export const companyPipeline = makePipeline([[
  teamPool,
  { type: 'worker_commission', workerId: 'Costea' },
  { type: 'worker_commission', workerId: 'George', commissionBase: 'company_revenue' },
]]);

export function sellerInputs(sales: Record<string, number>) {
  const inputs: Record<string, { salary?: number; individualRevenue?: number }> = {};
  for (const w of companyWorkers) {
    inputs[w.id] = {
      salary: w.formula_config.salaryAmount,
      individualRevenue: w.formula_config.revenueSource === 'individual' ? sales[w.id] ?? 0 : undefined,
    };
  }
  return inputs;
}
