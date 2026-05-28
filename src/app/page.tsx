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
import { SavedBonusesSection } from '@/components/SavedBonusesSection';
import { HistoricalComparisonCard } from '@/components/HistoricalComparisonCard';
import { TabHeader } from '@/components/TabHeader';
import type { Worker, Quarter, CalculationWithWorker } from '@/lib/types';
import { getCurrentQuarter, getCurrentYear, generatePeriod } from '@/lib/types';
import {
  getWorkers,
  getCalculation,
  getCalculationsByWorkerForPeriod,
} from '@/lib/supabase';
import { formatCurrency, getEffectiveSalary } from '@/lib/formulas';
import { usePersistedGlobalInputs, usePersistedPeriod } from '@/lib/usePersistedInputs';

const quarters: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];
const years = Array.from({ length: 5 }, (_, i) => getCurrentYear() - 2 + i);

function DashboardPageContent() {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const tHistory = useTranslations('workerHistory');

  const searchParams = useSearchParams();
  const router = useRouter();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
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

  // One-time load: workers. Calculations are loaded by a separate effect that
  // re-runs whenever the selected period changes.
  useEffect(() => {
    (async () => {
      try {
        const workersData = await getWorkers();
        setWorkers(workersData);
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

  // Historical total
  const historicalTotal = historicalCalculations.reduce((sum, calc) => sum + calc.final_amount, 0);

  // Sum of bonuses already SAVED for the current period (one latest entry per worker).
  const savedBonusesTotal = Object.values(calculationsByWorker).reduce(
    (sum, calcs) => sum + (calcs[0]?.final_amount ?? 0),
    0,
  );

  // "Total Bonusuri" shown on the dashboard: only saved bonuses for this period
  // (plus any historical-comparison entries the user opened).
  const totalBonus = savedBonusesTotal + historicalTotal;

  // Sum of every worker's salary — the company pays salaries whether or not
  // the pipeline applies them to the bonus pool, so they always reduce
  // finalRevenue. Monthly amounts are multiplied ×3 to match the quarter.
  const totalSalariesDeducted = workers.reduce((sum, w) => {
    const salary = w.formula_config.salaryAmount ?? 0;
    if (salary <= 0) return sum;
    return sum + getEffectiveSalary(w.formula_config, salary);
  }, 0);

  // Global taxes applied once to total revenue (avoids per-worker double-counting)
  const totalTaxesFromRevenue =
    (globalInputs.totalRevenue * (globalInputs.taxRate1 + globalInputs.taxRate2)) / 100;

  // Final revenue: what the company keeps after taxes, salaries, and saved bonuses.
  const finalRevenue = Math.max(
    0,
    globalInputs.totalRevenue
      - totalTaxesFromRevenue
      - totalSalariesDeducted
      - savedBonusesTotal,
  );

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
          <Card className="mb-8" accent="dashboard">
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
                  <div className="text-2xl font-bold font-mono tabular-nums text-primary">
                    {formatCurrency(totalBonus)}
                  </div>
                </div>

                {/* Final Revenue (what company keeps after deductions) */}
                <div className="space-y-2">
                  <Label>{t('finalRevenue')}</Label>
                  <div
                    className="text-2xl font-bold font-mono tabular-nums"
                    style={{ color: 'var(--tab-dashboard-strong)' }}
                  >
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

          {/* Revenue Breakdown Card — visible when revenue entered */}
          {globalInputs.totalRevenue > 0 && (
            <Card className="mb-8" accent="dashboard">
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
                    <span className="font-mono tabular-nums">{formatCurrency(globalInputs.totalRevenue)}</span>
                  </div>

                  {totalTaxesFromRevenue > 0 && (
                    <div className="flex justify-between text-sm text-red-600">
                      <span>
                        − {t('breakdownTaxes')} ({(globalInputs.taxRate1 + globalInputs.taxRate2).toFixed(1)}%)
                      </span>
                      <span className="font-mono tabular-nums">-{formatCurrency(totalTaxesFromRevenue)}</span>
                    </div>
                  )}

                  {totalSalariesDeducted > 0 && (
                    <div className="flex justify-between text-sm text-red-600">
                      <span>− {t('breakdownSalaries')}</span>
                      <span className="font-mono tabular-nums">-{formatCurrency(totalSalariesDeducted)}</span>
                    </div>
                  )}

                  {savedBonusesTotal > 0 && (
                    <div className="flex justify-between text-sm text-red-600">
                      <span>− {t('breakdownBonuses')}</span>
                      <span className="font-mono tabular-nums">-{formatCurrency(savedBonusesTotal)}</span>
                    </div>
                  )}

                  <div
                    className="flex justify-between text-base font-bold border-t pt-2"
                    style={{ color: 'var(--tab-dashboard-fg)' }}
                  >
                    <span>{t('finalRevenue')}</span>
                    <span className="font-mono tabular-nums">{formatCurrency(finalRevenue)}</span>
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
