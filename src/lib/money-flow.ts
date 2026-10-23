import type { CalculationWithWorker, GlobalCalculationInputs, Worker } from './types';
import type {
  CalculationPipeline,
  PipelineExecutionResult,
  PipelineItemResult,
} from './pipeline-types';
import { calculateFinalAmount, getEffectiveSalary } from './formulas';

/** Per-worker inputs in the shape the pipeline engine expects. */
export type WorkerInputs = Record<
  string,
  { salary?: number; individualRevenue?: number; daysWorked?: number }
>;

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isSeller(worker: Worker): boolean {
  return worker.formula_config.revenueSource === 'individual';
}

/** True for workers whose salary is a pay per day worked. */
export function isPaidPerDay(worker: Worker): boolean {
  return worker.formula_config.salaryPeriod === 'daily';
}

/** Salary for the whole quarter (monthly salaries count three times, daily
 *  ones once per day worked). */
export function quarterSalary(
  worker: Worker,
  input?: { salary?: number; daysWorked?: number },
): number {
  return getEffectiveSalary(
    worker.formula_config,
    input?.salary ?? worker.formula_config.salaryAmount ?? 0,
    input?.daysWorked,
  );
}

/** Sum of what every seller (individual-revenue worker) sold. */
export function sellersTotal(workers: Worker[], sales: Record<string, number>): number {
  return roundCents(
    workers.filter(isSeller).reduce((sum, w) => sum + (sales[w.id] ?? 0), 0),
  );
}

/**
 * Company revenue used by the calculation. When no company total is typed,
 * the company's sales are the sum of what the sellers sold.
 */
export function resolveCompanyRevenue(
  typedTotal: number | undefined,
  workers: Worker[],
  sales: Record<string, number>,
): number {
  return typedTotal !== undefined && typedTotal > 0
    ? typedTotal
    : sellersTotal(workers, sales);
}

export function buildWorkerInputs(
  workers: Worker[],
  sales: Record<string, number>,
  daysWorked: Record<string, number> = {},
): WorkerInputs {
  const inputs: WorkerInputs = {};
  for (const w of workers) {
    inputs[w.id] = {
      salary: w.formula_config.salaryAmount,
      individualRevenue: isSeller(w) ? sales[w.id] ?? 0 : undefined,
      daysWorked: isPaidPerDay(w) ? daysWorked[w.id] ?? 0 : undefined,
    };
  }
  return inputs;
}

// ============ Plain-language explanation of each step ============

export type ExplainedStep =
  | {
      kind: 'pool';
      itemId: string;
      stepIndex: number;
      label?: string;
      rate: number;
      base: number;
      baseSource: 'pipeline' | 'participants_sum';
      participants: { id: string; name: string; sales: number; quarterSalary: number }[];
      deductsSalaries: boolean;
      gross: number;
      salaries: number;
      net: number;
      perPerson: number;
    }
  | {
      kind: 'commission';
      itemId: string;
      stepIndex: number;
      workerId: string;
      name: string;
      rate: number;
      base: number;
      /** What the rate was applied to, in words the boss uses. */
      basis: 'own_sales' | 'own_sales_reduced' | 'company_revenue' | 'running_total';
      gross: number;
      nettedSalary: number;
    }
  | { kind: 'tax'; itemId: string; stepIndex: number; taxIndex: 1 | 2; rate: number; base: number; amount: number }
  | { kind: 'expense'; itemId: string; stepIndex: number; label: string; rate?: number; base: number; amount: number }
  | {
      kind: 'salary';
      itemId: string;
      stepIndex: number;
      workerId: string;
      name: string;
      /** Part of the salary taken out of the bonus above it. */
      fromBonus: number;
      /** Part of the salary paid as a company cost at this step. */
      cost: number;
    };

/** Turns the engine's results into one plain-language step per pipeline card. */
export function explainPipeline(
  pipeline: CalculationPipeline,
  result: PipelineExecutionResult,
  workers: Worker[],
  workerInputs: WorkerInputs,
  globalInputs: GlobalCalculationInputs,
): ExplainedStep[] {
  const workerMap = new Map(workers.map((w) => [w.id, w]));
  const steps: ExplainedStep[] = [];

  pipeline.rows.forEach((row, stepIndex) => {
    const rowResult = result.rowResults[stepIndex];
    for (const item of row.items) {
      const r: PipelineItemResult | undefined = rowResult?.itemResults.find((ir) => ir.itemId === item.id);
      if (!r) continue;

      switch (item.type) {
        case 'shared_pool_commission': {
          const participants = (item.participantIds ?? [])
            .map((id) => workerMap.get(id))
            .filter((w): w is Worker => w !== undefined)
            .map((w) => ({
              id: w.id,
              name: w.name,
              sales: workerInputs[w.id]?.individualRevenue ?? 0,
              quarterSalary: quarterSalary(w, workerInputs[w.id]),
            }));
          steps.push({
            kind: 'pool',
            itemId: item.id,
            stepIndex,
            label: item.label,
            rate: item.poolRate ?? 0,
            base: r.poolBase ?? r.inputAmount,
            baseSource: r.poolBaseSource ?? 'participants_sum',
            participants,
            deductsSalaries: !!item.deductParticipantSalaries,
            gross: r.poolAmount ?? 0,
            salaries: r.poolSalaryDeducted ?? 0,
            net: r.netPool ?? 0,
            perPerson: r.perPerson ?? 0,
          });
          break;
        }
        case 'worker_commission': {
          const worker = item.workerId ? workerMap.get(item.workerId) : undefined;
          if (!worker) break;
          let basis: Extract<ExplainedStep, { kind: 'commission' }>['basis'];
          if (isSeller(worker)) {
            const ownSales = workerInputs[worker.id]?.individualRevenue ?? 0;
            basis = r.inputAmount === ownSales ? 'own_sales' : 'own_sales_reduced';
          } else if (
            item.commissionBase === 'company_revenue'
            || r.inputAmount === globalInputs.totalRevenue
          ) {
            basis = 'company_revenue';
          } else {
            basis = 'running_total';
          }
          steps.push({
            kind: 'commission',
            itemId: item.id,
            stepIndex,
            workerId: worker.id,
            name: worker.name,
            rate: worker.formula_config.commissionRate,
            base: r.inputAmount,
            basis,
            gross: r.commissionAmount ?? 0,
            nettedSalary: r.nettedSalary ?? 0,
          });
          break;
        }
        case 'tax': {
          const taxIndex = item.taxIndex === 1 ? 1 : 2;
          steps.push({
            kind: 'tax',
            itemId: item.id,
            stepIndex,
            taxIndex,
            rate: taxIndex === 1 ? globalInputs.taxRate1 : globalInputs.taxRate2,
            base: r.inputAmount,
            amount: r.deductedAmount,
          });
          break;
        }
        case 'custom_deduction': {
          steps.push({
            kind: 'expense',
            itemId: item.id,
            stepIndex,
            label: item.label ?? '',
            rate: item.rate !== undefined && item.rate > 0 ? item.rate : undefined,
            base: r.inputAmount,
            amount: r.deductedAmount,
          });
          break;
        }
        case 'salary': {
          const worker = item.workerId ? workerMap.get(item.workerId) : undefined;
          if (!worker) break;
          steps.push({
            kind: 'salary',
            itemId: item.id,
            stepIndex,
            workerId: worker.id,
            name: worker.name,
            fromBonus: r.nettedSalary ?? 0,
            cost: r.deductedAmount,
          });
          break;
        }
      }
    }
  });

  return steps;
}

/** True when the step decides (part of) this worker's bonus. */
export function stepInvolvesWorker(step: ExplainedStep, workerId: string): boolean {
  switch (step.kind) {
    case 'pool':
      return step.participants.some((p) => p.id === workerId);
    case 'commission':
    case 'salary':
      return step.workerId === workerId;
    default:
      return false;
  }
}

// ============ Where the money goes ============

export interface PersonPay {
  workerId: string;
  name: string;
  quarterSalary: number;
  /** For workers paid per day: how the quarter salary was made up. */
  perDay?: { days: number; rate: number };
  /** True when a commission or shared-pool card gives this person a bonus. */
  hasRule: boolean;
  /** Bonus from the pipeline rules. */
  bonus: number;
  /** What-if bonus the boss chose to pay this quarter. */
  extraBonus: number;
  /** Manual adjustment saved earlier for this quarter (with its note). */
  adjustment: number;
  /** What is actually paid as bonus: rules + what-if + adjustment, never below 0. */
  bonusToPay: number;
  totalPay: number;
}

export interface MoneyFlow {
  companyRevenue: number;
  taxes: number;
  expenses: number;
  salaries: number;
  bonuses: number;
  /** Revenue left after everything above. Negative means a loss. */
  companyKeeps: number;
  people: PersonPay[];
}

/**
 * Every euro of company revenue split into taxes, expenses, salaries (all
 * staff, paid every month whatever the pipeline says), bonuses, and what the
 * company keeps.
 */
export function summarizeMoneyFlow(
  result: PipelineExecutionResult,
  workers: Worker[],
  workerInputs: WorkerInputs,
  extraBonuses: Record<string, number> = {},
  adjustments: Record<string, number> = {},
): MoneyFlow {
  let taxes = 0;
  let expenses = 0;
  for (const row of result.rowResults) {
    for (const item of row.itemResults) {
      if (item.type === 'tax') taxes += item.deductedAmount;
      if (item.type === 'custom_deduction') expenses += item.deductedAmount;
    }
  }

  const people: PersonPay[] = workers.map((w) => {
    const salary = quarterSalary(w, workerInputs[w.id]);
    const hasRule = result.workerBreakdowns[w.id] !== undefined;
    const bonus = hasRule ? result.workerCommissions[w.id] ?? 0 : 0;
    const extraBonus = roundCents(extraBonuses[w.id] ?? 0);
    const adjustment = roundCents(adjustments[w.id] ?? 0);
    const bonusToPay = calculateFinalAmount(bonus + extraBonus, adjustment);
    return {
      workerId: w.id,
      name: w.name,
      quarterSalary: salary,
      perDay: isPaidPerDay(w)
        ? {
            days: workerInputs[w.id]?.daysWorked ?? 0,
            rate: workerInputs[w.id]?.salary ?? w.formula_config.salaryAmount ?? 0,
          }
        : undefined,
      hasRule,
      bonus,
      extraBonus,
      adjustment,
      bonusToPay,
      totalPay: roundCents(salary + bonusToPay),
    };
  });

  const salaries = roundCents(people.reduce((s, p) => s + p.quarterSalary, 0));
  const bonuses = roundCents(people.reduce((s, p) => s + p.bonusToPay, 0));
  taxes = roundCents(taxes);
  expenses = roundCents(expenses);

  return {
    companyRevenue: result.startingRevenue,
    taxes,
    expenses,
    salaries,
    bonuses,
    companyKeeps: roundCents(result.startingRevenue - taxes - expenses - salaries - bonuses),
    people,
  };
}

// ============ What-if bonuses for people without a bonus rule ============

export interface WhatIfBonus {
  mode: 'percent' | 'fixed';
  value: number;
  /** When true the bonus is paid this quarter and saved with the others. */
  pay: boolean;
}

export function whatIfAmount(whatIf: WhatIfBonus | undefined, companyRevenue: number): number {
  if (!whatIf || !(whatIf.value > 0)) return 0;
  return roundCents(
    whatIf.mode === 'percent' ? (companyRevenue * whatIf.value) / 100 : whatIf.value,
  );
}

// ============ Restoring a saved quarter ============

export interface QuarterSeed {
  sales: Record<string, number>;
  /** Days worked by people paid per day. */
  days: Record<string, number>;
  /** Company total typed when the quarter was saved; undefined when it was
   *  simply the sellers' total. */
  companyRevenue?: number;
  whatIf: Record<string, WhatIfBonus>;
}

/** Inputs to show for a quarter that was saved before and not edited since. */
export function seedFromSaved(
  workers: Worker[],
  latestSaved: Record<string, CalculationWithWorker | undefined>,
): QuarterSeed {
  const sales: Record<string, number> = {};
  const days: Record<string, number> = {};
  const whatIf: Record<string, WhatIfBonus> = {};
  let companyRevenue: number | undefined;

  for (const w of workers) {
    const calc = latestSaved[w.id];
    if (!calc) continue;
    const inputs = calc.inputs;
    if (isSeller(w) && typeof inputs.individualRevenue === 'number') {
      sales[w.id] = inputs.individualRevenue;
    }
    if (isPaidPerDay(w) && typeof inputs.daysWorked === 'number') {
      days[w.id] = inputs.daysWorked;
    }
    if (typeof inputs.companyRevenue === 'number') {
      companyRevenue ??= inputs.companyRevenue;
    } else if (!isSeller(w) && inputs.baseValue > 0) {
      // Older records: a company-revenue worker's base was the company total.
      companyRevenue ??= inputs.baseValue;
    }
    const calculated = Number(calc.calculated_amount);
    if (calculated > 0) whatIf[w.id] = { mode: 'fixed', value: calculated, pay: true };
  }

  if (companyRevenue !== undefined && companyRevenue === sellersTotal(workers, sales)) {
    companyRevenue = undefined;
  }
  return { sales, days, companyRevenue, whatIf };
}

// ============ Saving a quarter ============

export interface QuarterSaveRow {
  workerId: string;
  calculatedAmount: number;
  adjustmentAmount: number;
  adjustmentNote: string;
  finalAmount: number;
}

/** Adjustments saved earlier for the quarter, so a re-save keeps them. */
export function savedAdjustments(
  latestSaved: Record<string, CalculationWithWorker | undefined>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [workerId, calc] of Object.entries(latestSaved)) {
    const amount = Number(calc?.adjustment_amount ?? 0);
    if (amount !== 0) out[workerId] = amount;
  }
  return out;
}

/**
 * One saved record per person whose bonus is decided this quarter: everyone
 * with a bonus rule, anyone given a what-if bonus, and anyone saved before
 * this quarter (so removing a what-if bonus is saved too). Adjustments come
 * from the flow, so pass savedAdjustments() to summarizeMoneyFlow to keep them.
 */
export function buildQuarterSaveRows(
  flow: MoneyFlow,
  latestSaved: Record<string, CalculationWithWorker | undefined>,
): QuarterSaveRow[] {
  return flow.people
    .filter((p) => p.hasRule || p.extraBonus > 0 || latestSaved[p.workerId] !== undefined)
    .map((p) => ({
      workerId: p.workerId,
      calculatedAmount: roundCents(p.bonus + p.extraBonus),
      adjustmentAmount: p.adjustment,
      adjustmentNote: p.adjustment !== 0 ? latestSaved[p.workerId]?.adjustment_note ?? '' : '',
      finalAmount: p.bonusToPay,
    }));
}

/** True when saving now would store different bonuses than the latest save. */
export function hasUnsavedChanges(
  rows: QuarterSaveRow[],
  latestSaved: Record<string, CalculationWithWorker | undefined>,
): boolean {
  return rows.some((row) => {
    const saved = latestSaved[row.workerId];
    return !saved || roundCents(Number(saved.calculated_amount)) !== row.calculatedAmount;
  });
}
