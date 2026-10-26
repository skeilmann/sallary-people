import { describe, expect, it } from 'vitest';
import { executePipeline } from './pipeline-engine';
import {
  buildQuarterSaveRows,
  buildWorkerInputs,
  explainPipeline,
  hasUnsavedChanges,
  resolveCompanyRevenue,
  savedAdjustments,
  seedFromSaved,
  summarizeMoneyFlow,
  whatIfAmount,
} from './money-flow';
import type { CalculationWithWorker } from './types';
import { companyPipeline, companyWorkers, makePipeline, makeWorker } from './test-fixtures';

const sales = { Kiril: 60_000, Liuba: 40_000, Costea: 50_000 };

function runQuarter(typedTotal?: number) {
  const totalRevenue = resolveCompanyRevenue(typedTotal, companyWorkers, sales);
  const globalInputs = { totalRevenue, taxRate1: 0, taxRate2: 0 };
  const workerInputs = buildWorkerInputs(companyWorkers, sales);
  const result = executePipeline(companyPipeline, globalInputs, companyWorkers, workerInputs);
  return { globalInputs, workerInputs, result };
}

function saved(workerId: string, calculated: number, adjustment = 0, note: string | null = null): CalculationWithWorker {
  return {
    id: `calc-${workerId}`,
    worker_id: workerId,
    period: 'Q3 2026',
    inputs: { baseValue: 0 },
    calculated_amount: calculated,
    adjustment_amount: adjustment,
    adjustment_note: note,
    final_amount: calculated + adjustment,
    created_at: '2026-10-01T10:00:00Z',
    worker: { id: workerId, name: workerId },
  };
}

describe('resolveCompanyRevenue', () => {
  it("uses the sellers' total when no company total is typed", () => {
    expect(resolveCompanyRevenue(undefined, companyWorkers, sales)).toBe(150_000);
    expect(resolveCompanyRevenue(0, companyWorkers, sales)).toBe(150_000);
  });

  it('uses the typed total when there is one', () => {
    expect(resolveCompanyRevenue(180_000, companyWorkers, sales)).toBe(180_000);
  });
});

describe('summarizeMoneyFlow', () => {
  it('splits company revenue into salaries, bonuses and what the company keeps', () => {
    const { result, workerInputs } = runQuarter();
    const flow = summarizeMoneyFlow(result, companyWorkers, workerInputs);
    // Quarter salaries: Kiril 4,350 + Liuba 1,650 + Francesca 3,600 + Lorenzo 3,000
    expect(flow.salaries).toBe(12_600);
    // Bonuses: Kiril 1,000 + Liuba 1,000 + Costea 5,000 + George 1,500
    expect(flow.bonuses).toBe(8_500);
    expect(flow.companyKeeps).toBe(150_000 - 12_600 - 8_500);

    const kiril = flow.people.find((p) => p.workerId === 'Kiril')!;
    expect(kiril).toMatchObject({ quarterSalary: 4_350, bonus: 1_000, hasRule: true, totalPay: 5_350 });
    const francesca = flow.people.find((p) => p.workerId === 'Francesca')!;
    expect(francesca).toMatchObject({ quarterSalary: 3_600, bonus: 0, hasRule: false, totalPay: 3_600 });
  });

  it('pays someone on a daily rate in lei for the days worked, in euro, plus the bonus', () => {
    const totalRevenue = resolveCompanyRevenue(undefined, companyWorkers, sales);
    const workerInputs = buildWorkerInputs(companyWorkers, sales, { George: 25 });
    expect(workerInputs.George.daysWorked).toBe(25);
    expect(workerInputs.Kiril.daysWorked).toBeUndefined();
    const result = executePipeline(
      companyPipeline, { totalRevenue, taxRate1: 0, taxRate2: 0 }, companyWorkers, workerInputs,
    );
    const flow = summarizeMoneyFlow(result, companyWorkers, workerInputs);
    const george = flow.people.find((p) => p.workerId === 'George')!;
    expect(george).toMatchObject({
      // 25 days × 275 RON = 6,875 RON; at 5.1 RON per euro = €1,348.04
      quarterSalary: 1_348.04,
      localSalary: { amount: 6_875, currency: 'RON' },
      perDay: { days: 25, rate: 275, currency: 'RON' },
      bonus: 1_500, // 1% of all company sales, unchanged
      totalPay: 2_848.04,
    });
    expect(flow.salaries).toBe(12_600 + 1_348.04);
    // Salaries agreed in euro have no second currency.
    expect(flow.people.find((p) => p.workerId === 'Kiril')!.localSalary).toBeUndefined();
  });

  it('adds what-if bonuses on top, and they reduce what the company keeps', () => {
    const { result, workerInputs, globalInputs } = runQuarter();
    const extra = {
      Francesca: whatIfAmount({ mode: 'percent', value: 1, pay: true }, globalInputs.totalRevenue),
      Lorenzo: whatIfAmount({ mode: 'fixed', value: 500, pay: true }, globalInputs.totalRevenue),
    };
    expect(extra).toEqual({ Francesca: 1_500, Lorenzo: 500 });
    const flow = summarizeMoneyFlow(result, companyWorkers, workerInputs, extra);
    expect(flow.bonuses).toBe(10_500);
    expect(flow.companyKeeps).toBe(150_000 - 12_600 - 10_500);
    expect(flow.people.find((p) => p.workerId === 'Francesca')!.totalPay).toBe(5_100);
  });

  it('agrees with the pipeline when a salary card is used, and never counts a salary twice', () => {
    const ana = makeWorker('Ana', { commissionRate: 10, salaryAmount: 10_000 });
    const result = executePipeline(
      makePipeline([[{ type: 'salary', workerId: 'Ana' }], [{ type: 'worker_commission', workerId: 'Ana' }]]),
      { totalRevenue: 100_000, taxRate1: 0, taxRate2: 0 }, [ana], {},
    );
    const flow = summarizeMoneyFlow(result, [ana], buildWorkerInputs([ana], {}));
    expect(flow.companyKeeps).toBe(result.finalRunningTotal);
    expect(flow.companyKeeps).toBe(81_000);
  });

  it('shows a loss as a negative amount instead of hiding it at zero', () => {
    const big = makeWorker('Big', { commissionRate: 0, salaryAmount: 30_000, salaryPeriod: 'monthly' });
    const result = executePipeline(
      makePipeline([[{ type: 'tax', taxIndex: 1 }]]),
      { totalRevenue: 50_000, taxRate1: 10, taxRate2: 0 }, [big], {},
    );
    const flow = summarizeMoneyFlow(result, [big], buildWorkerInputs([big], {}));
    expect(flow.taxes).toBe(5_000);
    expect(flow.companyKeeps).toBe(50_000 - 5_000 - 90_000);
  });
});

describe('explainPipeline', () => {
  it('describes each card in the words the boss uses', () => {
    const { result, workerInputs, globalInputs } = runQuarter();
    const steps = explainPipeline(companyPipeline, result, companyWorkers, workerInputs, globalInputs);
    expect(steps).toHaveLength(3);

    expect(steps[0]).toMatchObject({
      kind: 'pool', rate: 8, base: 100_000, gross: 8_000, salaries: 6_000, net: 2_000, perPerson: 1_000,
      deductsSalaries: true,
    });
    if (steps[0].kind !== 'pool') throw new Error('expected pool');
    expect(steps[0].participants.map((p) => [p.name, p.sales, p.quarterSalary])).toEqual([
      ['Kiril', 60_000, 4_350],
      ['Liuba', 40_000, 1_650],
    ]);

    expect(steps[1]).toMatchObject({ kind: 'commission', name: 'Costea', rate: 10, base: 50_000, basis: 'own_sales', gross: 5_000 });
    expect(steps[2]).toMatchObject({ kind: 'commission', name: 'George', rate: 1, base: 150_000, basis: 'company_revenue', gross: 1_500 });
  });

  it('says when a commission was calculated on what was left after earlier steps', () => {
    const george = makeWorker('George', { commissionRate: 1 });
    const pipeline = makePipeline([
      [{ type: 'custom_deduction', label: 'Rent', fixedAmount: 10_000 }],
      [{ type: 'worker_commission', workerId: 'George' }],
    ]);
    const globalInputs = { totalRevenue: 100_000, taxRate1: 0, taxRate2: 0 };
    const result = executePipeline(pipeline, globalInputs, [george], {});
    const steps = explainPipeline(pipeline, result, [george], {}, globalInputs);
    expect(steps[0]).toMatchObject({ kind: 'expense', label: 'Rent', amount: 10_000 });
    expect(steps[1]).toMatchObject({ kind: 'commission', basis: 'running_total', base: 90_000, gross: 900 });
  });
});

describe('seedFromSaved', () => {
  it("restores sellers' sales and paid what-if bonuses from a saved quarter", () => {
    const seed = seedFromSaved(companyWorkers, {
      Kiril: { ...saved('Kiril', 1_000), inputs: { baseValue: 60_000, individualRevenue: 60_000, companyRevenue: 150_000 } },
      Liuba: { ...saved('Liuba', 1_000), inputs: { baseValue: 40_000, individualRevenue: 40_000, companyRevenue: 150_000 } },
      Costea: { ...saved('Costea', 5_000), inputs: { baseValue: 50_000, individualRevenue: 50_000, companyRevenue: 150_000 } },
      Lorenzo: saved('Lorenzo', 500),
    });
    expect(seed.sales).toEqual({ Kiril: 60_000, Liuba: 40_000, Costea: 50_000 });
    // 150,000 is just the sellers' total, so it was not typed.
    expect(seed.companyRevenue).toBeUndefined();
    expect(seed.whatIf.Lorenzo).toEqual({ mode: 'fixed', value: 500, pay: true });
  });

  it('restores the days worked of people paid per day', () => {
    const seed = seedFromSaved(companyWorkers, {
      George: { ...saved('George', 1_500), inputs: { baseValue: 150_000, companyRevenue: 150_000, daysWorked: 25 } },
    });
    expect(seed.days).toEqual({ George: 25 });
  });

  it('restores a typed company total, also from older records without companyRevenue', () => {
    const seed = seedFromSaved(companyWorkers, {
      Kiril: { ...saved('Kiril', 1_000), inputs: { baseValue: 60_000, individualRevenue: 60_000 } },
      George: { ...saved('George', 2_000), inputs: { baseValue: 200_000 } },
    });
    expect(seed.companyRevenue).toBe(200_000);
  });
});

describe('saving a quarter', () => {
  it('saves everyone with a bonus rule plus paid what-if bonuses, keeping earlier adjustments', () => {
    const { result, workerInputs } = runQuarter();
    const latest = { Costea: saved('Costea', 4_000, 250, 'Big order') };
    const flow = summarizeMoneyFlow(
      result, companyWorkers, workerInputs, { Francesca: 1_500 }, savedAdjustments(latest),
    );
    expect(flow.people.find((p) => p.workerId === 'Costea')).toMatchObject({ bonusToPay: 5_250, totalPay: 5_250 });
    expect(flow.bonuses).toBe(8_500 + 1_500 + 250);
    const rows = buildQuarterSaveRows(flow, latest);

    expect(rows.map((r) => r.workerId).sort()).toEqual(['Costea', 'Francesca', 'George', 'Kiril', 'Liuba']);
    expect(rows.find((r) => r.workerId === 'Costea')).toEqual({
      workerId: 'Costea', calculatedAmount: 5_000, adjustmentAmount: 250, adjustmentNote: 'Big order', finalAmount: 5_250,
    });
    expect(rows.find((r) => r.workerId === 'Francesca')).toMatchObject({ calculatedAmount: 1_500, finalAmount: 1_500 });
  });

  it('saves a zero when a what-if bonus saved earlier is removed', () => {
    const { result, workerInputs } = runQuarter();
    const flow = summarizeMoneyFlow(result, companyWorkers, workerInputs);
    const rows = buildQuarterSaveRows(flow, { Lorenzo: saved('Lorenzo', 500) });
    expect(rows.find((r) => r.workerId === 'Lorenzo')).toMatchObject({ calculatedAmount: 0, finalAmount: 0 });
  });

  it('knows whether the shown bonuses are already saved', () => {
    const { result, workerInputs } = runQuarter();
    const rows = buildQuarterSaveRows(summarizeMoneyFlow(result, companyWorkers, workerInputs), {});
    expect(hasUnsavedChanges(rows, {})).toBe(true);
    const all = Object.fromEntries(rows.map((r) => [r.workerId, saved(r.workerId, r.calculatedAmount)]));
    expect(hasUnsavedChanges(rows, all)).toBe(false);
  });
});
