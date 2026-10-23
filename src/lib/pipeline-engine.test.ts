import { describe, expect, it } from 'vitest';
import { executePipeline } from './pipeline-engine';
import {
  companyPipeline,
  companyWorkers,
  makePipeline,
  makeWorker,
  sellerInputs,
  teamPool,
} from './test-fixtures';

const noTax = { taxRate1: 0, taxRate2: 0 };

describe('company rules', () => {
  const sales = { Kiril: 60_000, Liuba: 40_000, Costea: 50_000 };

  it('team pool: 8% of team sales, minus 3 months of both salaries, split in two', () => {
    const result = executePipeline(
      companyPipeline, { totalRevenue: 150_000, ...noTax }, companyWorkers, sellerInputs(sales),
    );
    const pool = result.rowResults[0].itemResults[0];
    expect(pool.poolBase).toBe(100_000);
    expect(pool.poolAmount).toBe(8_000);
    expect(pool.poolSalaryDeducted).toBe(6_000); // (1,450 + 550) × 3
    expect(pool.netPool).toBe(2_000);
    expect(result.workerCommissions.Kiril).toBe(1_000);
    expect(result.workerCommissions.Liuba).toBe(1_000);
  });

  it('solo seller gets his rate of his own sales; manager gets 1% of all company sales', () => {
    const result = executePipeline(
      companyPipeline, { totalRevenue: 150_000, ...noTax }, companyWorkers, sellerInputs(sales),
    );
    expect(result.workerCommissions.Costea).toBe(5_000);
    expect(result.workerCommissions.George).toBe(1_500);
  });

  it('salary-only people get no bonus and no breakdown', () => {
    const result = executePipeline(
      companyPipeline, { totalRevenue: 150_000, ...noTax }, companyWorkers, sellerInputs(sales),
    );
    expect(result.workerCommissions.Francesca).toBe(0);
    expect(result.workerBreakdowns.Francesca).toBeUndefined();
    expect(result.workerBreakdowns.Lorenzo).toBeUndefined();
  });

  it('weak quarter: pool smaller than salaries means no bonus, never a negative one', () => {
    const result = executePipeline(
      companyPipeline,
      { totalRevenue: 60_000, ...noTax },
      companyWorkers,
      sellerInputs({ Kiril: 40_000, Liuba: 20_000, Costea: 0 }),
    );
    const pool = result.rowResults[0].itemResults[0];
    expect(pool.poolAmount).toBe(4_800);
    expect(pool.netPool).toBe(0);
    expect(result.workerCommissions.Kiril).toBe(0);
    expect(result.workerCommissions.Liuba).toBe(0);
  });

  it('manager on "all company sales" is not reduced by steps placed above him', () => {
    const pipeline = makePipeline([
      [teamPool, { type: 'worker_commission', workerId: 'Costea' }],
      [{ type: 'tax', taxIndex: 1 }],
      [{ type: 'worker_commission', workerId: 'George', commissionBase: 'company_revenue' }],
    ]);
    const result = executePipeline(
      pipeline, { totalRevenue: 150_000, taxRate1: 16, taxRate2: 0 }, companyWorkers, sellerInputs(sales),
    );
    expect(result.workerCommissions.George).toBe(1_500);
  });

  it('without that option a commission still follows its position (existing behaviour)', () => {
    const pipeline = makePipeline([
      [{ type: 'custom_deduction', label: 'Rent', fixedAmount: 10_000 }],
      [{ type: 'worker_commission', workerId: 'George' }],
    ]);
    const result = executePipeline(
      pipeline, { totalRevenue: 150_000, ...noTax }, companyWorkers, sellerInputs(sales),
    );
    expect(result.workerCommissions.George).toBe(1_400);
  });
});

describe('salary cards', () => {
  const revenue = { totalRevenue: 100_000, ...noTax };

  function salaryAfterCommission(salary: number) {
    const ana = makeWorker('Ana', { commissionRate: 10, salaryAmount: salary });
    return executePipeline(
      makePipeline([
        [{ type: 'worker_commission', workerId: 'Ana' }],
        [{ type: 'salary', workerId: 'Ana' }],
      ]),
      revenue, [ana], {},
    );
  }

  it('after a commission, the salary is taken from the bonus with no jump at the edge', () => {
    expect(salaryAfterCommission(9_000).workerCommissions.Ana).toBe(1_000);
    expect(salaryAfterCommission(9_999).workerCommissions.Ana).toBe(1);
    expect(salaryAfterCommission(10_000).workerCommissions.Ana).toBe(0);
    expect(salaryAfterCommission(10_001).workerCommissions.Ana).toBe(0);
  });

  it('a salary bigger than the commission is still paid in full by the company', () => {
    const result = salaryAfterCommission(12_000);
    // The company pays 12,000 in total: the 10,000 commission covers part of it.
    expect(result.finalRunningTotal).toBe(88_000);
    const salaryItem = result.rowResults[1].itemResults[0];
    expect(salaryItem.nettedSalary).toBe(10_000);
    expect(salaryItem.deductedAmount).toBe(2_000);
  });

  it('before a commission, the salary is a cost and is never added to the bonus', () => {
    const ana = makeWorker('Ana', { commissionRate: 10, salaryAmount: 10_000 });
    const result = executePipeline(
      makePipeline([
        [{ type: 'salary', workerId: 'Ana' }],
        [{ type: 'worker_commission', workerId: 'Ana' }],
      ]),
      revenue, [ana], {},
    );
    expect(result.workerCommissions.Ana).toBe(9_000);
    expect(result.finalRunningTotal).toBe(81_000);
  });
});
