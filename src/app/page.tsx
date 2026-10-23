'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SavedBonusesSection } from '@/components/SavedBonusesSection';
import { HistoricalComparisonCard } from '@/components/HistoricalComparisonCard';
import { TabHeader } from '@/components/TabHeader';
import { StepExplanationList } from '@/components/StepExplanation';
import { PipelineWarnings } from '@/components/pipeline/PipelineWarnings';
import { QuarterInputsCard } from '@/components/quarter/QuarterInputsCard';
import { MoneyFlowCard } from '@/components/quarter/MoneyFlowCard';
import { PeopleTableCard } from '@/components/quarter/PeopleTableCard';
import { WhatIfCard } from '@/components/quarter/WhatIfCard';
import type { Worker, Quarter, CalculationWithWorker } from '@/lib/types';
import type { CalculationPipeline } from '@/lib/pipeline-types';
import { getCurrentQuarter, getCurrentYear, generatePeriod } from '@/lib/types';
import {
  createCalculation,
  getCalculation,
  getCalculationsByWorkerForPeriod,
  getDefaultPipeline,
  getWorkers,
} from '@/lib/supabase';
import { formatCurrency } from '@/lib/formulas';
import { executePipeline } from '@/lib/pipeline-engine';
import { validatePipeline } from '@/lib/pipeline-utils';
import {
  buildQuarterSaveRows,
  buildWorkerInputs,
  explainPipeline,
  hasUnsavedChanges,
  isSeller,
  savedAdjustments,
  sellersTotal,
  summarizeMoneyFlow,
  whatIfAmount,
} from '@/lib/money-flow';
import { usePersistedGlobalInputs, usePersistedPeriod } from '@/lib/usePersistedInputs';
import { useQuarterInputs } from '@/lib/useQuarterInputs';

const years = Array.from({ length: 5 }, (_, i) => getCurrentYear() - 2 + i);

function DashboardPageContent() {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const tHistory = useTranslations('workerHistory');

  const searchParams = useSearchParams();
  const router = useRouter();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [pipeline, setPipeline] = useState<CalculationPipeline | null>(null);
  const [loading, setLoading] = useState(true);
  // Calcs for the currently selected period only, grouped by worker, newest first.
  const [calculationsByWorker, setCalculationsByWorker] = useState<
    Record<string, CalculationWithWorker[]>
  >({});
  const [saving, setSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<{ period: string; count: number } | null>(null);

  // Persisted period selection (survives refresh, syncs across pages)
  const { quarter, year, setQuarter, setYear } = usePersistedPeriod(
    getCurrentQuarter(),
    getCurrentYear(),
  );
  const currentPeriod = generatePeriod(quarter as Quarter, year);
  const currentPeriodRef = useRef(currentPeriod);
  useEffect(() => {
    currentPeriodRef.current = currentPeriod;
  }, [currentPeriod]);

  // Tax rates are settings shared with the Pipeline page; they only matter
  // when the pipeline has tax steps.
  const { globalInputs, setGlobalInputs } = usePersistedGlobalInputs();

  // This quarter's sales, company total and what-if bonuses.
  const quarterInputs = useQuarterInputs(currentPeriod, workers, calculationsByWorker);
  const { sales, companyRevenue, latestSaved, whatIf } = quarterInputs;

  // Historical calculations for comparison
  const [historicalCalculations, setHistoricalCalculations] = useState<CalculationWithWorker[]>([]);

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

  // One-time load: workers and the bonus rules. Calculations are loaded by a
  // separate effect that re-runs whenever the selected period changes.
  useEffect(() => {
    (async () => {
      try {
        const [workersData, pipelineData] = await Promise.all([
          getWorkers(),
          getDefaultPipeline().catch((error) => {
            console.error('Failed to load pipeline:', error);
            return null;
          }),
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

  // ==================== The quarter's calculation ====================

  const engineGlobalInputs = useMemo(
    () => ({
      taxRate1: globalInputs.taxRate1,
      taxRate2: globalInputs.taxRate2,
      totalRevenue: companyRevenue,
    }),
    [globalInputs.taxRate1, globalInputs.taxRate2, companyRevenue],
  );
  const workerInputs = useMemo(() => buildWorkerInputs(workers, sales), [workers, sales]);

  const result = useMemo(
    () => pipeline && pipeline.rows.length > 0
      ? executePipeline(pipeline, engineGlobalInputs, workers, workerInputs)
      : null,
    [pipeline, engineGlobalInputs, workers, workerInputs],
  );

  const steps = useMemo(
    () => result && pipeline
      ? explainPipeline(pipeline, result, workers, workerInputs, engineGlobalInputs)
      : [],
    [result, pipeline, workers, workerInputs, engineGlobalInputs],
  );

  const issues = useMemo(() => {
    if (!pipeline) return [];
    const validation = validatePipeline(pipeline, workers);
    return [...validation.errors, ...validation.warnings];
  }, [pipeline, workers]);

  // What-if bonuses only apply to people without a bonus rule. "Paid" ones
  // count in this quarter's numbers; the rest are only a simulation.
  const { allWhatIf, paidWhatIf } = useMemo(() => {
    const all: Record<string, number> = {};
    const paid: Record<string, number> = {};
    if (result) {
      for (const w of workers) {
        if (result.workerBreakdowns[w.id]) continue;
        const amount = whatIfAmount(whatIf[w.id], companyRevenue);
        if (amount > 0) {
          all[w.id] = amount;
          if (whatIf[w.id]?.pay) paid[w.id] = amount;
        }
      }
    }
    return { allWhatIf: all, paidWhatIf: paid };
  }, [result, workers, whatIf, companyRevenue]);

  const adjustments = useMemo(() => savedAdjustments(latestSaved), [latestSaved]);

  const flow = useMemo(
    () => result ? summarizeMoneyFlow(result, workers, workerInputs, paidWhatIf, adjustments) : null,
    [result, workers, workerInputs, paidWhatIf, adjustments],
  );
  const simulatedFlow = useMemo(
    () => result ? summarizeMoneyFlow(result, workers, workerInputs, allWhatIf, adjustments) : null,
    [result, workers, workerInputs, allWhatIf, adjustments],
  );

  const saveRows = useMemo(
    () => flow ? buildQuarterSaveRows(flow, latestSaved) : [],
    [flow, latestSaved],
  );
  const unsaved = hasUnsavedChanges(saveRows, latestSaved);
  const lastSavedAt = Object.values(latestSaved).reduce<string | null>(
    (latest, calc) => (calc && (!latest || calc.created_at > latest) ? calc.created_at : latest),
    null,
  );

  const handleSaveQuarter = async () => {
    if (saveRows.length === 0) return;
    const period = currentPeriod;
    setSaving(true);
    setSaveFailure(null);
    const workerMap = new Map(workers.map((w) => [w.id, w]));
    const results = await Promise.allSettled(
      saveRows.map((row) => {
        const worker = workerMap.get(row.workerId);
        const seller = worker ? isSeller(worker) : false;
        return createCalculation({
          worker_id: row.workerId,
          period,
          inputs: {
            baseValue: seller ? sales[row.workerId] ?? 0 : companyRevenue,
            salary: worker?.formula_config.salaryAmount ?? 0,
            individualRevenue: seller ? sales[row.workerId] ?? 0 : undefined,
            companyRevenue,
          },
          calculated_amount: row.calculatedAmount,
          adjustment_amount: row.adjustmentAmount,
          adjustment_note: row.adjustmentNote || null,
          final_amount: row.finalAmount,
        });
      }),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    try {
      const refreshed = await getCalculationsByWorkerForPeriod(period);
      if (currentPeriodRef.current === period) setCalculationsByWorker(refreshed);
    } catch (error) {
      console.error('Failed to reload calculations after saving:', error);
    }
    setSaving(false);
    setSaveFailure(failed > 0 ? { period, count: failed } : null);
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
      <>
        <TabHeader tab="dashboard" />
        <div className="container mx-auto p-6">
          <div className="text-center py-12 text-muted-foreground">{tCommon('loading')}</div>
        </div>
      </>
    );
  }

  const historicalTotal = historicalCalculations.reduce((sum, calc) => sum + calc.final_amount, 0);
  const sellers = workers.filter(isSeller);
  const hasRules = !!pipeline && pipeline.rows.length > 0;
  const hasTaxSteps = !!pipeline?.rows.some((row) => row.items.some((item) => item.type === 'tax'));

  return (
    <>
      <TabHeader tab="dashboard" />
      <div className="container mx-auto p-6">
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
        <div className="space-y-8">
          {/* Historical Comparison Banner */}
          {historicalCalculations.length > 0 && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
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

          {workers.length > 0 && (
            <QuarterInputsCard
              quarter={quarter as Quarter}
              year={year}
              years={years}
              onQuarterChange={setQuarter}
              onYearChange={setYear}
              sellers={sellers}
              sales={sales}
              onSaleChange={quarterInputs.setSale}
              typedCompanyRevenue={quarterInputs.typedCompanyRevenue}
              sellersTotal={sellersTotal(workers, sales)}
              onCompanyRevenueChange={quarterInputs.setCompanyRevenue}
              showTaxRates={hasTaxSteps}
              taxRate1={globalInputs.taxRate1}
              taxRate2={globalInputs.taxRate2}
              onTaxRateChange={(index, value) =>
                setGlobalInputs((prev) => ({ ...prev, [index === 1 ? 'taxRate1' : 'taxRate2']: value }))
              }
            />
          )}

          {workers.length > 0 && !hasRules && (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                <h3 className="text-lg font-semibold mb-2">{t('noPipelineTitle')}</h3>
                <p className="text-muted-foreground mb-4">{t('noPipelineText')}</p>
                <Link href="/pipeline">
                  <Button>{t('openPipeline')}</Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {hasRules && flow && companyRevenue <= 0 && (
            <p className="rounded-lg border border-dashed px-4 py-8 text-center text-muted-foreground">
              {t('typeSalesFirst')}
            </p>
          )}

          {hasRules && flow && companyRevenue > 0 && (
            <>
              <MoneyFlowCard flow={flow} />

              <div className="grid gap-8 lg:grid-cols-[3fr_2fr] lg:items-start">
                <PeopleTableCard
                  flow={flow}
                  steps={steps}
                  period={currentPeriod}
                  saving={saving}
                  saveFailedCount={saveFailure?.period === currentPeriod ? saveFailure.count : 0}
                  unsaved={unsaved}
                  lastSavedAt={lastSavedAt}
                  canSave={saveRows.length > 0}
                  onSave={handleSaveQuarter}
                />

                <Card>
                  <CardHeader>
                    <CardTitle>{t('howTitle')}</CardTitle>
                    <CardDescription>{t('howSubtitle')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <PipelineWarnings issues={issues} />
                    <StepExplanationList steps={steps} />
                    <Link
                      href="/pipeline"
                      className="inline-block text-sm text-primary underline underline-offset-2"
                    >
                      {t('howEdit')}
                    </Link>
                  </CardContent>
                </Card>
              </div>

              <WhatIfCard
                people={flow.people.filter((p) => !p.hasRule)}
                whatIf={whatIf}
                onChange={quarterInputs.setWhatIf}
                companyRevenue={companyRevenue}
                companyKeepsNow={flow.companyKeeps}
                companyKeepsWithAll={simulatedFlow?.companyKeeps ?? flow.companyKeeps}
              />
            </>
          )}

          {/* Saved Bonuses for the selected period only */}
          {workers.length > 0 && (
            <SavedBonusesSection
              workers={workers}
              calculationsByWorker={calculationsByWorker}
              period={currentPeriod}
            />
          )}

          {/* Historical Calculations Section */}
          {historicalCalculations.length > 0 && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">{tHistory('historicalCalculations')}</h2>
                <Badge variant="outline" className="bg-blue-50">
                  {tHistory('fromHistory')}
                </Badge>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {historicalCalculations.map((calc) => (
                  <HistoricalComparisonCard
                    key={calc.id}
                    calculation={calc}
                    onRemove={handleRemoveHistorical}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Quick Links */}
          <div className="flex gap-4">
            <Link href="/workers">
              <Button variant="outline">{t('manageWorkers')}</Button>
            </Link>
            <Link href="/history">
              <Button variant="outline">{t('viewHistory')}</Button>
            </Link>
          </div>
        </div>
      )}
      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardPageContent />
    </RequireAuth>
  );
}
