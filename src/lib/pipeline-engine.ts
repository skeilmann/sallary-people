import type {
  CalculationPipeline,
  PipelineItem,
  PipelineExecutionResult,
  PipelineItemResult,
  PipelineRowResult,
} from './pipeline-types';
import type { Worker, GlobalCalculationInputs } from './types';

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

  for (let rowIndex = 0; rowIndex < pipeline.rows.length; rowIndex++) {
    const row = pipeline.rows[rowIndex];
    const runningTotalBefore = runningTotal;
    const itemResults: PipelineItemResult[] = [];
    let totalDeductions = 0;

    for (const item of row.items) {
      const result = executeItem(
        item,
        runningTotalBefore,
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
          // (individual revenue for individual-source workers, running total otherwise)
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
      const salaryAmount = item.workerId
        ? (workerInputs[item.workerId]?.salary ?? worker?.formula_config.salaryAmount ?? 0)
        : 0;
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

      // Determine the base amount for commission
      // Individual-revenue workers use their own revenue, not the pipeline running total
      // Then apply per-worker deductions (salary, tax) to get the net amount
      const isIndividual = config.revenueSource === 'individual';
      const rawBase = isIndividual
        ? (workerInputs[worker.id]?.individualRevenue ?? 0)
        : runningTotal;

      let baseAmount = rawBase;

      // Deduct salary if configured
      if (config.deductSalary) {
        const salaryToDeduct = workerInputs[worker.id]?.salary ?? config.salaryAmount ?? 0;
        baseAmount -= salaryToDeduct;
      }

      // Deduct per-worker tax if configured
      if (config.applyTaxDeductions) {
        if (config.workerTaxRate != null && config.workerTaxRate > 0) {
          baseAmount -= rawBase * (config.workerTaxRate / 100);
        } else {
          baseAmount -= rawBase * (globalInputs.taxRate1 / 100);
          baseAmount -= rawBase * (globalInputs.taxRate2 / 100);
        }
      }

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
