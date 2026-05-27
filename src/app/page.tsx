'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WorkerBonusCard } from '@/components/WorkerBonusCard';
import { SavedBonusesSection } from '@/components/SavedBonusesSection';
import { HistoricalComparisonCard } from '@/components/HistoricalComparisonCard';
import { BulkSavePipelineModal, type BulkSaveFailure, type BulkSaveRow } from '@/components/BulkSavePipelineModal';
import type { Worker, GlobalCalculationInputs, Quarter, CalculationInputs, CalculationWithWorker } from '@/lib/types';
import { getCurrentQuarter, getCurrentYear, generatePeriod } from '@/lib/types';
import {
  getWorkers,
  createCalculation,
  getCalculation,
  getDefaultPipeline,
  getCalculationsByWorkerForPeriod,
} from '@/lib/supabase';
import { formatCurrency, calculateBonusWithGlobalInputs, getEffectiveSalary } from '@/lib/formulas';
import type { CalculationPipeline, PipelineExecutionResult } from '@/lib/pipeline-types';
import { executePipeline } from '@/lib/pipeline-engine';
import { usePersistedGlobalInputs, usePersistedIndividualRevenues, usePersistedPeriod } from '@/lib/usePersistedInputs';

const quarters: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];
const years = Array.from({ length: 5 }, (_, i) => getCurrentYear() - 2 + i);

function DashboardPageContent() {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const tHistory = useTranslations('workerHistory');
  const tPipeline = useTranslations('pipeline');

  const searchParams = useSearchParams();
  const router = useRouter();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [pipeline, setPipeline] = useState<CalculationPipeline | null>(null);
  // Calcs for the currently selected period only, grouped by worker, newest first.
  const [calculationsByWorker, setCalculationsByWorker] = useState<
    Record<string, CalculationWithWorker[]>
  >({});

  // Persisted period selection (survives refresh, syncs across pages)
  const { quarter, year, setQuarter, setYear } = usePersistedPeriod(
    getCurrentQuarter(),
    getCurrentYear(),
  );

  // Persisted global inputs (survives refresh, syncs across pages)
  const { globalInputs, setGlobalInputs } = usePersistedGlobalInputs();

  // Persisted individual revenues per worker (survives refresh, syncs across pages).
  // This is shared with /calculate, so we don't clobber it on quarter change —
  // instead we keep a dashboard-local override (below).
  const { individualRevenues, setIndividualRevenues } = usePersistedIndividualRevenues();

  // Dashboard-local override: when a saved calc exists for the selected quarter,
  // its individual revenue is shown here. Survives within the dashboard only.
  const [quarterIndividualRevenue, setQuarterIndividualRevenue] = useState<
    Record<string, number>
  >({});

  // Bulk save (pipeline) selection + modal state
  const [selectedForBulkSave, setSelectedForBulkSave] = useState<Set<string>>(new Set());
  const [bulkSaveOpen, setBulkSaveOpen] = useState(false);

  // Historical calculations for comparison
  const [historicalCalculations, setHistoricalCalculations] = useState<CalculationWithWorker[]>([]);

  const currentPeriod = generatePeriod(quarter as Quarter, year);

  // Check for compare parameter and load historical calculations
  useEffect(() => {
    const compareIds = searchParams.get('compare');
    if (compareIds) {
      loadHistoricalCalculations(compareIds.split(','));
    }
  }, [searchParams]);

  const loadHistoricalCalculations = async (ids: string[]) => {
    try {
      const calculations = await Promise.all(
        ids.map(async (id) => {
          const calc = await getCalculation(id);
          return calc;
        })
      );
      setHistoricalCalculations(calculations.filter((c): c is CalculationWithWorker => c !== null));
    } catch (error) {
      console.error('Failed to load historical calculations:', error);
    }
  };

  // One-time load: workers + pipeline. Calculations are loaded by a separate
  // effect that re-runs whenever the selected period changes.
  useEffect(() => {
    (async () => {
      try {
        const [workersData, pipelineData] = await Promise.all([
          getWorkers(),
          getDefaultPipeline().catch(() => null),
        ]);
        setWorkers(workersData);
        setPipeline(pipelineData);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Reload calculations whenever the selected period changes.
  // The `cancelled` flag prevents a slow earlier-period response from
  // overwriting a faster later-period response when the user clicks quickly.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getCalculationsByWorkerForPeriod(currentPeriod);
        if (!cancelled) setCalculationsByWorker(data);
      } catch (error) {
        console.error('Failed to load calculations for period:', error);
        if (!cancelled) setCalculationsByWorker({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentPeriod]);

  // When the period's saved data changes (load or after save), seed the
  // dashboard-local quarter revenue override from saved values. We deliberately
  // do not write to the cross-page persisted hook here.
  useEffect(() => {
    const seed: Record<string, number> = {};
    for (const [workerId, calcs] of Object.entries(calculationsByWorker)) {
      const latest = calcs[0];
      const v = latest?.inputs.individualRevenue;
      if (v !== undefined && v !== null) seed[workerId] = v;
    }
    setQuarterIndividualRevenue(seed);
  }, [calculationsByWorker]);

  // Read order: quarter-specific saved value > cross-page persisted value > 0.
  // This keeps switching quarters showing what was saved, while a fresh entry
  // (in a quarter with no saves yet) still uses the value the user last typed.
  const readIndividualRevenue = (workerId: string): number =>
    quarterIndividualRevenue[workerId] ?? individualRevenues[workerId] ?? 0;

  // Build workerInputs map for pipeline engine
  const workerInputsMap: Record<string, { salary?: number; individualRevenue?: number }> = {};
  for (const worker of workers) {
    workerInputsMap[worker.id] = {
      salary: worker.formula_config.salaryAmount,
      individualRevenue: worker.formula_config.revenueSource === 'individual'
        ? readIndividualRevenue(worker.id)
        : undefined,
    };
  }

  // Execute pipeline if available, otherwise fall back to per-worker calculation
  const pipelineResult: PipelineExecutionResult | null =
    pipeline && workers.length > 0
      ? executePipeline(pipeline, globalInputs, workers, workerInputsMap)
      : null;

  // Calculate total bonus for all workers
  const currentWorkersTotal = pipelineResult
    ? Object.values(pipelineResult.workerCommissions).reduce((sum, c) => sum + c, 0)
    : workers.reduce((sum, worker) => {
        const isIndividual = worker.formula_config.revenueSource === 'individual';
        return sum + calculateBonusWithGlobalInputs(worker.formula_config, globalInputs, {
          salary: worker.formula_config.salaryAmount,
          individualRevenue: isIndividual ? readIndividualRevenue(worker.id) : undefined,
        });
      }, 0);

  // Historical total
  const historicalTotal = historicalCalculations.reduce((sum, calc) => sum + calc.final_amount, 0);

  // Combined total
  const totalBonus = currentWorkersTotal + historicalTotal;

  // Sum of all salaries actually deducted across workers (only when deductSalary is on).
  // Monthly amounts are multiplied ×3 to match the quarterly bonus period.
  const totalSalariesDeducted = workers.reduce((sum, w) => {
    if (!w.formula_config.deductSalary) return sum;
    return sum + getEffectiveSalary(w.formula_config, w.formula_config.salaryAmount ?? 0);
  }, 0);

  // Global taxes applied once to total revenue (avoids per-worker double-counting)
  const totalTaxesFromRevenue =
    (globalInputs.totalRevenue * (globalInputs.taxRate1 + globalInputs.taxRate2)) / 100;

  // Final revenue: what the company keeps after taxes, salaries, and bonuses.
  // When a pipeline is active, its engine already tracks this authoritatively.
  const finalRevenue = pipelineResult
    ? pipelineResult.finalRunningTotal
    : Math.max(
        0,
        globalInputs.totalRevenue
          - totalTaxesFromRevenue
          - totalSalariesDeducted
          - currentWorkersTotal,
      );

  const refreshCalculationsForPeriod = async () => {
    const refreshed = await getCalculationsByWorkerForPeriod(currentPeriod).catch(() => null);
    if (refreshed) setCalculationsByWorker(refreshed);
  };

  const handleSaveBonus = async (data: {
    workerId: string;
    calculatedAmount: number;
    adjustmentAmount: number;
    adjustmentNote: string;
    finalAmount: number;
    salary: number;
    individualRevenue?: number;
  }) => {
    try {
      const worker = workers.find((w) => w.id === data.workerId);
      if (!worker) return;

      const isIndividual = worker.formula_config.revenueSource === 'individual';
      const baseValue = isIndividual
        ? (data.individualRevenue || 0)
        : globalInputs.totalRevenue;

      const inputs: CalculationInputs = {
        baseValue,
        salary: data.salary,
        individualRevenue: isIndividual ? data.individualRevenue : undefined,
      };

      await createCalculation({
        worker_id: data.workerId,
        period: currentPeriod,
        inputs,
        calculated_amount: data.calculatedAmount,
        adjustment_amount: data.adjustmentAmount,
        adjustment_note: data.adjustmentNote || null,
        final_amount: data.finalAmount,
      });

      await refreshCalculationsForPeriod();
    } catch (error) {
      console.error('Failed to save calculation:', error);
      alert(t('saveFailed'));
    }
  };

  const handleBulkSaveConfirm = async (rows: BulkSaveRow[]): Promise<BulkSaveFailure[]> => {
    const results = await Promise.allSettled(
      rows.map(async (r) => {
        const worker = workers.find((w) => w.id === r.workerId);
        if (!worker) throw new Error('worker not found');
        const isIndividual = worker.formula_config.revenueSource === 'individual';
        const baseValue = isIndividual
          ? (r.individualRevenue ?? 0)
          : globalInputs.totalRevenue;
        const inputs: CalculationInputs = {
          baseValue,
          salary: r.salary,
          individualRevenue: isIndividual ? r.individualRevenue : undefined,
        };
        await createCalculation({
          worker_id: r.workerId,
          period: currentPeriod,
          inputs,
          calculated_amount: r.calculatedAmount,
          adjustment_amount: r.adjustmentAmount,
          adjustment_note: r.adjustmentNote || null,
          final_amount: r.finalAmount,
        });
        return r.workerId;
      }),
    );

    const failures: BulkSaveFailure[] = [];
    const succeededWorkerIds: string[] = [];
    results.forEach((res, i) => {
      const r = rows[i];
      if (res.status === 'fulfilled') {
        succeededWorkerIds.push(r.workerId);
      } else {
        failures.push({
          workerId: r.workerId,
          message: res.reason instanceof Error ? res.reason.message : String(res.reason),
        });
      }
    });

    await refreshCalculationsForPeriod();
    // Drop succeeded workers from selection; keep failed ones for retry.
    setSelectedForBulkSave((prev) => {
      const next = new Set(prev);
      for (const id of succeededWorkerIds) next.delete(id);
      return next;
    });
    return failures;
  };

  const handleRemoveHistorical = (calculationId: string) => {
    setHistoricalCalculations((prev) => prev.filter((c) => c.id !== calculationId));
    // Update URL
    const remaining = historicalCalculations.filter((c) => c.id !== calculationId).map((c) => c.id);
    if (remaining.length > 0) {
      router.push(`/?compare=${remaining.join(',')}`);
    } else {
      router.push('/');
    }
    // Update localStorage
    if (remaining.length > 0) {
      localStorage.setItem('compareCalculationIds', JSON.stringify(remaining));
    } else {
      localStorage.removeItem('compareCalculationIds');
    }
  };

  const handleClearAllHistorical = () => {
    setHistoricalCalculations([]);
    router.push('/');
    localStorage.removeItem('compareCalculationIds');
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12 text-muted-foreground">{tCommon('loading')}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      {workers.length === 0 && historicalCalculations.length === 0 ? (
        /* Empty state for new users */
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-semibold mb-2">{t('getStarted')}</h3>
            <p className="text-muted-foreground mb-4">{t('addWorkersFirst')}</p>
            <Link href="/workers">
              <Button>{t('addWorkers')}</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Historical Comparison Banner */}
          {historicalCalculations.length > 0 && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="default" className="bg-blue-600">
                    {tHistory('comparingCount', { count: historicalCalculations.length })}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {tHistory('historicalTotal')}: {formatCurrency(historicalTotal)}
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={handleClearAllHistorical}>
                  {tHistory('clearComparison')}
                </Button>
              </div>
            </div>
          )}

          {/* Global Inputs Section */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>{t('globalInputs')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-6">
                {/* Period Selection */}
                <div className="space-y-2">
                  <Label>{t('period')}</Label>
                  <div className="flex gap-2">
                    <Select value={quarter} onValueChange={(v) => setQuarter(v as Quarter)}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {quarters.map((q) => (
                          <SelectItem key={q} value={q}>
                            {q}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map((y) => (
                          <SelectItem key={y} value={y.toString()}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Total Revenue */}
                <div className="space-y-2">
                  <Label htmlFor="revenue">{t('totalRevenue')}</Label>
                  <Input
                    id="revenue"
                    type="number"
                    min="0"
                    step="1000"
                    value={globalInputs.totalRevenue || ''}
                    onChange={(e) =>
                      setGlobalInputs((prev) => ({
                        ...prev,
                        totalRevenue: parseFloat(e.target.value) || 0,
                      }))
                    }
                    placeholder="0"
                  />
                </div>

                {/* Tax Rate 1 */}
                <div className="space-y-2">
                  <Label htmlFor="tax1">{t('taxRate1')}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="tax1"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={globalInputs.taxRate1 || ''}
                      onChange={(e) =>
                        setGlobalInputs((prev) => ({
                          ...prev,
                          taxRate1: parseFloat(e.target.value) || 0,
                        }))
                      }
                      placeholder="0"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </div>

                {/* Tax Rate 2 */}
                <div className="space-y-2">
                  <Label htmlFor="tax2">{t('taxRate2')}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="tax2"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={globalInputs.taxRate2 || ''}
                      onChange={(e) =>
                        setGlobalInputs((prev) => ({
                          ...prev,
                          taxRate2: parseFloat(e.target.value) || 0,
                        }))
                      }
                      placeholder="0"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </div>

                {/* Total Preview */}
                <div className="space-y-2">
                  <Label>{t('totalBonuses')}</Label>
                  <div className="text-2xl font-bold text-primary">
                    {formatCurrency(totalBonus)}
                  </div>
                </div>

                {/* Final Revenue (what company keeps after deductions) */}
                <div className="space-y-2">
                  <Label>{t('finalRevenue')}</Label>
                  <div className="text-2xl font-bold text-emerald-600">
                    {formatCurrency(finalRevenue)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Saved Bonuses for the selected period only */}
          {workers.length > 0 && (
            <SavedBonusesSection
              workers={workers}
              calculationsByWorker={calculationsByWorker}
              period={currentPeriod}
            />
          )}

          {/* Revenue Breakdown Card — only when no pipeline & revenue entered */}
          {!pipelineResult && globalInputs.totalRevenue > 0 && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>{t('revenueBreakdown')}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t('revenueBreakdownSubtitle')}
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-w-md">
                  <div className="flex justify-between text-sm">
                    <span>{t('totalRevenue')}</span>
                    <span>{formatCurrency(globalInputs.totalRevenue)}</span>
                  </div>

                  {totalTaxesFromRevenue > 0 && (
                    <div className="flex justify-between text-sm text-red-600">
                      <span>
                        − {t('breakdownTaxes')} ({(globalInputs.taxRate1 + globalInputs.taxRate2).toFixed(1)}%)
                      </span>
                      <span>-{formatCurrency(totalTaxesFromRevenue)}</span>
                    </div>
                  )}

                  {totalSalariesDeducted > 0 && (
                    <div className="flex justify-between text-sm text-red-600">
                      <span>− {t('breakdownSalaries')}</span>
                      <span>-{formatCurrency(totalSalariesDeducted)}</span>
                    </div>
                  )}

                  {currentWorkersTotal > 0 && (
                    <div className="flex justify-between text-sm text-red-600">
                      <span>− {t('breakdownBonuses')}</span>
                      <span>-{formatCurrency(currentWorkersTotal)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-base font-bold border-t pt-2 text-emerald-700">
                    <span>{t('finalRevenue')}</span>
                    <span>{formatCurrency(finalRevenue)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Historical Calculations Section */}
          {historicalCalculations.length > 0 && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">{tHistory('historicalCalculations')}</h2>
                <Badge variant="outline" className="bg-blue-50">
                  {tHistory('fromHistory')}
                </Badge>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
                {historicalCalculations.map((calc) => (
                  <HistoricalComparisonCard
                    key={calc.id}
                    calculation={calc}
                    onRemove={handleRemoveHistorical}
                  />
                ))}
              </div>
            </>
          )}

          {/* Worker Bonus Cards */}
          {workers.length > 0 && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold">{t('workerBonuses')}</h2>
                  {pipeline && (
                    <Link href="/pipeline">
                      <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                        {tPipeline('pipelineActive')}
                      </Badge>
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Bulk-save controls — only relevant when pipeline is active */}
                  {pipelineResult && (() => {
                    const eligibleIds = workers
                      .filter((w) =>
                        w.formula_config.revenueSource === 'individual' ||
                        globalInputs.totalRevenue > 0,
                      )
                      .map((w) => w.id);
                    const allSelected =
                      eligibleIds.length > 0 &&
                      eligibleIds.every((id) => selectedForBulkSave.has(id));
                    return (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setSelectedForBulkSave(
                              allSelected ? new Set() : new Set(eligibleIds),
                            )
                          }
                          disabled={eligibleIds.length === 0}
                        >
                          {allSelected ? t('deselectAll') : t('selectAll')}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setBulkSaveOpen(true)}
                          disabled={selectedForBulkSave.size === 0}
                        >
                          {t('saveSelectedForPeriod', {
                            count: selectedForBulkSave.size,
                            period: currentPeriod,
                          })}
                        </Button>
                      </>
                    );
                  })()}
                  <Badge variant="outline">{currentPeriod}</Badge>
                </div>
              </div>

              {/* Show cards - workers with individual revenue don't need global revenue input */}
              {(() => {
                // Check if any worker uses global revenue
                const hasGlobalRevenueWorkers = workers.some(
                  (w) => w.formula_config.revenueSource !== 'individual'
                );
                const needsGlobalRevenue = hasGlobalRevenueWorkers && globalInputs.totalRevenue === 0;

                return (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {workers.map((worker) => {
                      const isIndividual = worker.formula_config.revenueSource === 'individual';
                      // Show placeholder for global revenue workers if no revenue entered
                      if (!isIndividual && globalInputs.totalRevenue === 0) {
                        return (
                          <Card key={worker.id} className="border-dashed opacity-60">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-lg">
                                <Link href={`/workers?edit=${worker.id}`} className="hover:underline hover:text-primary transition-colors">
                                  {worker.name}
                                </Link>
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="py-4 text-center text-muted-foreground text-sm">
                              {t('enterRevenueFirst')}
                            </CardContent>
                          </Card>
                        );
                      }

                      // Get pipeline-computed values if available
                      const pipelineCommission = pipelineResult?.workerCommissions[worker.id];
                      const pipelineBreakdown = pipelineResult?.workerBreakdowns[worker.id];

                      const latestForPeriod = calculationsByWorker[worker.id]?.[0];
                      const savedSnapshot = latestForPeriod
                        ? {
                            id: latestForPeriod.id,
                            salary: latestForPeriod.inputs.salary,
                            adjustmentAmount: latestForPeriod.adjustment_amount,
                            adjustmentNote: latestForPeriod.adjustment_note,
                            calculatedAmount: latestForPeriod.calculated_amount,
                          }
                        : null;

                      const hasSavedForPeriod = !!latestForPeriod;

                      return (
                        <div key={worker.id} className="relative">
                          {hasSavedForPeriod && (
                            <Badge className="absolute -top-2 -right-2 z-10 bg-green-600">
                              {t('saved')}
                            </Badge>
                          )}
                          <WorkerBonusCard
                            worker={worker}
                            globalInputs={globalInputs}
                            individualRevenue={readIndividualRevenue(worker.id)}
                            onIndividualRevenueChange={(value) => {
                              setIndividualRevenues((prev) => ({
                                ...prev,
                                [worker.id]: value,
                              }));
                              setQuarterIndividualRevenue((prev) => ({
                                ...prev,
                                [worker.id]: value,
                              }));
                            }}
                            pipelineCommissionAmount={pipelineCommission}
                            pipelineBaseAmount={pipelineBreakdown?.baseAmount}
                            savedSnapshot={savedSnapshot}
                            showSelectionCheckbox={!!pipelineResult}
                            isSelected={selectedForBulkSave.has(worker.id)}
                            onSelectionChange={(checked) => {
                              setSelectedForBulkSave((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(worker.id);
                                else next.delete(worker.id);
                                return next;
                              });
                            }}
                            onSave={handleSaveBonus}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

            </>
          )}

          {/* Bulk save confirmation modal */}
          {pipelineResult && (
            <BulkSavePipelineModal
              open={bulkSaveOpen}
              onClose={() => setBulkSaveOpen(false)}
              workers={workers.filter((w) => selectedForBulkSave.has(w.id))}
              pipelineResult={pipelineResult}
              individualRevenues={(() => {
                const m: Record<string, number> = {};
                for (const w of workers) m[w.id] = readIndividualRevenue(w.id);
                return m;
              })()}
              period={currentPeriod}
              onConfirm={handleBulkSaveConfirm}
            />
          )}

          {/* Quick Links */}
          <div className="mt-8 flex gap-4">
            <Link href="/workers">
              <Button variant="outline">{t('manageWorkers')}</Button>
            </Link>
            <Link href="/history">
              <Button variant="outline">{t('viewHistory')}</Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardPageContent />
    </RequireAuth>
  );
}
