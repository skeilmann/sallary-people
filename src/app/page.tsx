'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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
import { HistoricalComparisonCard } from '@/components/HistoricalComparisonCard';
import type { Worker, GlobalCalculationInputs, Quarter, CalculationInputs, CalculationWithWorker } from '@/lib/types';
import { getCurrentQuarter, getCurrentYear, generatePeriod } from '@/lib/types';
import { getWorkers, createCalculation, getCalculation, getDefaultPipeline } from '@/lib/supabase';
import { formatCurrency, calculateBonusWithGlobalInputs } from '@/lib/formulas';
import type { CalculationPipeline, PipelineExecutionResult } from '@/lib/pipeline-types';
import { executePipeline } from '@/lib/pipeline-engine';

const quarters: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];
const years = Array.from({ length: 5 }, (_, i) => getCurrentYear() - 2 + i);

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const tHistory = useTranslations('workerHistory');
  const tPipeline = useTranslations('pipeline');

  const searchParams = useSearchParams();
  const router = useRouter();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [pipeline, setPipeline] = useState<CalculationPipeline | null>(null);

  // Period selection
  const [quarter, setQuarter] = useState<Quarter>(getCurrentQuarter());
  const [year, setYear] = useState(getCurrentYear());

  // Global inputs
  const [globalInputs, setGlobalInputs] = useState<GlobalCalculationInputs>({
    totalRevenue: 0,
    taxRate1: 0,
    taxRate2: 0,
  });

  // Track saved calculations in this session
  const [savedWorkerIds, setSavedWorkerIds] = useState<Set<string>>(new Set());

  // Track individual revenues per worker (for workers with 'individual' revenue source)
  const [individualRevenues, setIndividualRevenues] = useState<Record<string, number>>({});

  // Historical calculations for comparison
  const [historicalCalculations, setHistoricalCalculations] = useState<CalculationWithWorker[]>([]);

  const currentPeriod = generatePeriod(quarter, year);

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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
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
  };

  // Build workerInputs map for pipeline engine
  const workerInputsMap: Record<string, { salary?: number; individualRevenue?: number }> = {};
  for (const worker of workers) {
    workerInputsMap[worker.id] = {
      salary: worker.formula_config.salaryAmount,
      individualRevenue: worker.formula_config.revenueSource === 'individual'
        ? (individualRevenues[worker.id] || 0)
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
          individualRevenue: isIndividual ? (individualRevenues[worker.id] || 0) : undefined,
        });
      }, 0);

  // Historical total
  const historicalTotal = historicalCalculations.reduce((sum, calc) => sum + calc.final_amount, 0);

  // Combined total
  const totalBonus = currentWorkersTotal + historicalTotal;

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

      // Determine the base value based on revenue source
      const isIndividual = worker.formula_config.revenueSource === 'individual';
      const baseValue = isIndividual
        ? (data.individualRevenue || 0)
        : globalInputs.totalRevenue;

      // Build inputs object for storage
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

      setSavedWorkerIds((prev) => new Set([...prev, data.workerId]));
    } catch (error) {
      console.error('Failed to save calculation:', error);
      alert(t('saveFailed'));
    }
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
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
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
              </div>
            </CardContent>
          </Card>

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
              <div className="mb-4 flex items-center justify-between">
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
                <Badge variant="outline">
                  {currentPeriod}
                </Badge>
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
                              <CardTitle className="text-lg">{worker.name}</CardTitle>
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

                      return (
                        <div key={worker.id} className="relative">
                          {savedWorkerIds.has(worker.id) && (
                            <Badge className="absolute -top-2 -right-2 z-10 bg-green-600">
                              {t('saved')}
                            </Badge>
                          )}
                          <WorkerBonusCard
                            worker={worker}
                            globalInputs={globalInputs}
                            individualRevenue={individualRevenues[worker.id] || 0}
                            onIndividualRevenueChange={(value) =>
                              setIndividualRevenues((prev) => ({
                                ...prev,
                                [worker.id]: value,
                              }))
                            }
                            pipelineCommissionAmount={pipelineCommission}
                            pipelineBaseAmount={pipelineBreakdown?.baseAmount}
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
