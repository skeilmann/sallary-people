import type {
  CalculationPipeline,
  PipelineItem,
  PipelineExecutionResult,
  PipelineItemResult,
  PipelineRowResult,
} from './pipeline-types';
import type { Worker, GlobalCalculationInputs } from './types';
import { getEffectiveSalary } from './formulas';

/**
 * Execute a calculation pipeline and return detailed results.
 *
 * The algorithm processes rows top-to-bottom:
 * 1. All items in a row receive the SAME running total (parallel execution)
 * 2. Deduction items (tax, salary, custom) subtract from the running total
 * 3. Worker commission items observe the running total AND reduce it by
 *    the commission amount paid out
 * 4. After all items in a row are processed, the running total is reduced
 *    by the sum of all deductions in that row
 */
export function executePipeline(
  pipeline: CalculationPipeline,
  globalInputs: GlobalCalculationInputs,
  workers: Worker[],
  workerInputs: Record<string, { salary?: number; individualRevenue?: number }>
): PipelineExecutionResult {
  const workerMap = new Map(workers.map(w => [w.id, w]));
  const workerCommissions: Record<string, number> = {};
  const workerBreakdowns: Record<string, {
    baseAmount: number;
    commissionRate: number;
    baseCommission: number;
    thresholdBonuses: number;
    totalCommission: number;
  }> = {};

  // Initialize all workers with 0 commission
  for (const worker of workers) {
    workerCommissions[worker.id] = 0;
  }

  let runningTotal = globalInputs.totalRevenue;
  const rowResults: PipelineRowResult[] = [];

  // Per-worker running base for individual-revenue workers. Starts at the
  // worker's individualRevenue input. As we walk rows, cards that "apply" to
  // an individual worker (their Salary card, Tax cards if applyTaxDeductions
  // is on) reduce this base — but only after the row containing them, so
  // same-row items still see the pre-row base.
  const individualBases: Record<string, number> = {};
  for (const worker of workers) {
    if (worker.formula_config.revenueSource === 'individual') {
      individualBases[worker.id] = workerInputs[worker.id]?.individualRevenue ?? 0;
    }
  }

  for (let rowIndex = 0; rowIndex < pipeline.rows.length; rowIndex++) {
    const row = pipeline.rows[rowIndex];
    const runningTotalBefore = runningTotal;
    const individualBasesBefore = { ...individualBases };
    const itemResults: PipelineItemResult[] = [];
    let totalDeductions = 0;

    for (const item of row.items) {
      const result = executeItem(
        item,
        runningTotalBefore,
        individualBasesBefore,
        globalInputs,
        workerMap,
        workerInputs
      );

      itemResults.push(result);

      if (item.type === 'worker_commission') {
        // Accumulate commission for worker (a worker may appear in multiple rows)
        if (result.workerId && result.commissionAmount !== undefined) {
          workerCommissions[result.workerId] =
            (workerCommissions[result.workerId] || 0) + result.commissionAmount;

          // Store breakdown — use result.inputAmount which is the actual base
          // (per-worker individual base for individual-source workers, pipeline
          // running total otherwise)
          const worker = result.workerId ? workerMap.get(result.workerId) : undefined;
          if (worker) {
            const config = worker.formula_config;
            const actualBase = result.inputAmount;
            const baseCommission = actualBase * (config.commissionRate / 100);
            const thresholdBonuses = (result.commissionAmount ?? 0) - baseCommission;
            workerBreakdowns[result.workerId] = {
              baseAmount: actualBase,
              commissionRate: config.commissionRate,
              baseCommission: Math.round(baseCommission * 100) / 100,
              thresholdBonuses: Math.round(thresholdBonuses * 100) / 100,
              totalCommission: result.commissionAmount ?? 0,
            };
          }
        }
        totalDeductions += result.deductedAmount;
      } else {
        totalDeductions += result.deductedAmount;
      }
    }

    // After the row completes, apply per-worker deductions for individual-revenue
    // workers:
    //  - Salary card: hits the matching worker's base directly.
    //  - Tax card: hits every individual-revenue worker whose applyTaxDeductions
    //    flag is on, proportionally to their individualRevenue.
    //  - Custom Deduction card (spending, vacation, supplies, etc.): treated as
    //    a company-wide expense that reduces every individual-revenue worker's
    //    base — fixed amounts subtract directly, percentages apply against
    //    individualRevenue.
    for (const item of row.items) {
      if (item.type === 'salary' && item.workerId) {
        const w = workerMap.get(item.workerId);
        if (w && w.formula_config.revenueSource === 'individual') {
          const rawSalary = workerInputs[w.id]?.salary ?? w.formula_config.salaryAmount ?? 0;
          const salaryAmount = getEffectiveSalary(w.formula_config, rawSalary);
          individualBases[w.id] = Math.max(0, (individualBases[w.id] ?? 0) - salaryAmount);
        }
      } else if (item.type === 'tax') {
        const taxRate = item.taxIndex === 1 ? globalInputs.taxRate1 : globalInputs.taxRate2;
        for (const w of workers) {
          if (w.formula_config.revenueSource === 'individual' && w.formula_config.applyTaxDeductions) {
            const indRev = workerInputs[w.id]?.individualRevenue ?? 0;
            const deduction = indRev * (taxRate / 100);
            individualBases[w.id] = Math.max(0, (individualBases[w.id] ?? 0) - deduction);
          }
        }
      } else if (item.type === 'custom_deduction') {
        for (const w of workers) {
          if (w.formula_config.revenueSource !== 'individual') continue;
          let deduction = 0;
          if (item.rate !== undefined && item.rate > 0) {
            const indRev = workerInputs[w.id]?.individualRevenue ?? 0;
            deduction = indRev * (item.rate / 100);
          } else if (item.fixedAmount !== undefined && item.fixedAmount > 0) {
            deduction = item.fixedAmount;
          }
          if (deduction > 0) {
            individualBases[w.id] = Math.max(0, (individualBases[w.id] ?? 0) - deduction);
          }
        }
      }
    }

    // Reduce running total by all deductions in this row
    runningTotal = Math.max(0, runningTotalBefore - totalDeductions);

    rowResults.push({
      rowId: row.id,
      rowIndex,
      runningTotalBefore,
      runningTotalAfter: runningTotal,
      itemResults,
    });
  }

  return {
    startingRevenue: globalInputs.totalRevenue,
    rowResults,
    finalRunningTotal: runningTotal,
    workerCommissions,
    workerBreakdowns,
  };
}

/**
 * Execute a single pipeline item against the current running total.
 */
function executeItem(
  item: PipelineItem,
  runningTotal: number,
  individualBasesBefore: Record<string, number>,
  globalInputs: GlobalCalculationInputs,
  workerMap: Map<string, Worker>,
  workerInputs: Record<string, { salary?: number; individualRevenue?: number }>
): PipelineItemResult {
  switch (item.type) {
    case 'tax': {
      const taxRate = item.taxIndex === 1
        ? globalInputs.taxRate1
        : globalInputs.taxRate2;
      const deducted = Math.round(runningTotal * (taxRate / 100) * 100) / 100;
      return {
        itemId: item.id,
        type: 'tax',
        label: `Tax ${item.taxIndex} (${taxRate}%)`,
        inputAmount: runningTotal,
        deductedAmount: deducted,
      };
    }

    case 'salary': {
      const worker = item.workerId ? workerMap.get(item.workerId) : undefined;
      const workerName = worker?.name ?? 'Unknown';
      const rawSalary = item.workerId
        ? (workerInputs[item.workerId]?.salary ?? worker?.formula_config.salaryAmount ?? 0)
        : 0;
      const salaryAmount = worker
        ? getEffectiveSalary(worker.formula_config, rawSalary)
        : rawSalary;
      return {
        itemId: item.id,
        type: 'salary',
        label: `${workerName} Salary`,
        inputAmount: runningTotal,
        deductedAmount: salaryAmount,
        workerName,
        workerId: item.workerId,
      };
    }

    case 'worker_commission': {
      const worker = item.workerId ? workerMap.get(item.workerId) : undefined;
      if (!worker) {
        return {
          itemId: item.id,
          type: 'worker_commission',
          label: 'Unknown Worker',
          inputAmount: runningTotal,
          deductedAmount: 0,
          commissionAmount: 0,
        };
      }

      const config = worker.formula_config;
      const workerName = worker.name;

      // Determine the base amount for commission. Position drives the value
      // in both modes — the only difference is which "running total" we read.
      //
      // 'global': company pipeline running total at this card's row. Cards
      //   above (Tax, Salary, Expense) already reduced it.
      // 'individual': per-worker running base starting from individualRevenue,
      //   reduced by this worker's Salary card and (if applyTaxDeductions is
      //   on) Tax cards that sit in earlier rows. Items in the same row see
      //   the pre-row snapshot, matching the existing "same row = same base"
      //   semantics.
      //
      // Either way, per-worker deductSalary / applyTaxDeductions / workerTaxRate
      // are no longer applied directly here — pipeline cards drive deductions.
      const isIndividual = config.revenueSource === 'individual';
      let baseAmount = isIndividual
        ? (individualBasesBefore[worker.id] ?? 0)
        : runningTotal;

      baseAmount = Math.max(0, baseAmount);

      // Base commission
      let commission = baseAmount * (config.commissionRate / 100);

      // Tiered threshold bonuses
      const sortedThresholds = [...config.bonusThresholds].sort((a, b) => a.above - b.above);
      for (const threshold of sortedThresholds) {
        if (baseAmount > threshold.above) {
          const amountAbove = baseAmount - threshold.above;
          commission += amountAbove * (threshold.extraRate / 100);
        }
      }

      commission = Math.round(commission * 100) / 100;

      return {
        itemId: item.id,
        type: 'worker_commission',
        label: `${workerName} (${config.commissionRate}%)`,
        inputAmount: baseAmount,
        deductedAmount: commission,
        commissionAmount: commission,
        workerName,
        workerId: worker.id,
      };
    }

    case 'custom_deduction': {
      const label = item.label ?? 'Custom Deduction';
      let deducted: number;

      if (item.rate !== undefined && item.rate > 0) {
        // Percentage-based deduction
        deducted = Math.round(runningTotal * (item.rate / 100) * 100) / 100;
      } else if (item.fixedAmount !== undefined && item.fixedAmount > 0) {
        // Fixed amount deduction
        deducted = item.fixedAmount;
      } else {
        deducted = 0;
      }

      return {
        itemId: item.id,
        type: 'custom_deduction',
        label: item.rate ? `${label} (${item.rate}%)` : label,
        inputAmount: runningTotal,
        deductedAmount: deducted,
      };
    }

    default:
      return {
        itemId: item.id,
        type: item.type,
        label: 'Unknown',
        inputAmount: runningTotal,
        deductedAmount: 0,
      };
  }
}
