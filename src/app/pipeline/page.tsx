'use client';

import { useEffect, useState, useCallback } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { PipelineBuilder, type SaveBonusInput } from '@/components/pipeline/PipelineBuilder';
import type {
  Worker,
  Quarter,
  CalculationInputs,
  CalculationWithWorker,
} from '@/lib/types';
import {
  getCurrentQuarter,
  getCurrentYear,
  generatePeriod,
} from '@/lib/types';
import type { CalculationPipeline, PipelineRow } from '@/lib/pipeline-types';
import {
  getWorkers,
  getDefaultPipeline,
  createPipeline,
  updatePipeline,
  deletePipeline,
  createCalculation,
  getCalculationsByWorkerForPeriod,
} from '@/lib/supabase';
import { generateDefaultPipeline } from '@/lib/pipeline-utils';
import {
  usePersistedGlobalInputs,
  usePersistedPeriod,
} from '@/lib/usePersistedInputs';
import type {
  BulkSaveFailure,
  BulkSaveRow,
} from '@/components/BulkSavePipelineModal';

const years = Array.from({ length: 5 }, (_, i) => getCurrentYear() - 2 + i);

function PipelinePageContent() {
  const t = useTranslations('pipeline');
  const tCommon = useTranslations('common');
  const tDashboard = useTranslations('dashboard');

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [pipeline, setPipeline] = useState<CalculationPipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasNoPipeline, setHasNoPipeline] = useState(false);
  const [calculationsByWorker, setCalculationsByWorker] = useState<
    Record<string, CalculationWithWorker[]>
  >({});

  // Period selection shared with Dashboard via localStorage
  const { quarter, year, setQuarter, setYear } = usePersistedPeriod(
    getCurrentQuarter(),
    getCurrentYear(),
  );
  const currentPeriod = generatePeriod(quarter as Quarter, year);

  // Global inputs shared with Dashboard
  const { globalInputs } = usePersistedGlobalInputs();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [workersData, pipelineData] = await Promise.all([
        getWorkers(),
        getDefaultPipeline(),
      ]);
      setWorkers(workersData);
      setPipeline(pipelineData);
      setHasNoPipeline(!pipelineData);
    } catch {
      // Workers or pipeline failed to load — try workers alone
      try {
        const workersData = await getWorkers();
        setWorkers(workersData);
      } catch {
        // Worker load also failed
      }
      setHasNoPipeline(true);
    } finally {
      setLoading(false);
    }
  };

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

  const refreshCalculationsForPeriod = async () => {
    const refreshed = await getCalculationsByWorkerForPeriod(currentPeriod).catch(() => null);
    if (refreshed) setCalculationsByWorker(refreshed);
  };

  const handleSavePipeline = useCallback(async (rows: PipelineRow[], name: string) => {
    if (pipeline) {
      const updated = await updatePipeline(pipeline.id, { rows, name });
      setPipeline(updated);
    } else {
      const created = await createPipeline({ rows, name });
      setPipeline(created);
      setHasNoPipeline(false);
    }
  }, [pipeline]);

  const handleDeletePipeline = useCallback(async () => {
    if (!pipeline) return;
    await deletePipeline(pipeline.id);
    setPipeline(null);
    setHasNoPipeline(true);
  }, [pipeline]);

  const handleGenerateDefault = useCallback(async () => {
    if (workers.length === 0) return;
    const defaultConfig = generateDefaultPipeline(workers);
    const created = await createPipeline(defaultConfig);
    setPipeline(created);
    setHasNoPipeline(false);
  }, [workers]);

  const handleSaveBonus = async (data: SaveBonusInput) => {
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
      alert(tDashboard('saveFailed'));
    }
  };

  const handleBulkSaveBonuses = async (
    rows: BulkSaveRow[],
  ): Promise<BulkSaveFailure[]> => {
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
    results.forEach((res, i) => {
      const r = rows[i];
      if (res.status === 'rejected') {
        failures.push({
          workerId: r.workerId,
          message: res.reason instanceof Error ? res.reason.message : String(res.reason),
        });
      }
    });

    await refreshCalculationsForPeriod();
    return failures;
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12 text-muted-foreground">{tCommon('loading')}</div>
      </div>
    );
  }

  if (workers.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground">{t('noWorkers')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        {hasNoPipeline && (
          <Button onClick={handleGenerateDefault}>
            {t('generateDefault')}
          </Button>
        )}
      </div>

      {hasNoPipeline ? (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
          <h3 className="text-lg font-semibold mb-2">{t('noPipeline')}</h3>
          <p className="text-muted-foreground mb-4">{t('subtitle')}</p>
          <Button onClick={handleGenerateDefault} size="lg">
            {t('generateDefault')}
          </Button>
        </div>
      ) : (
        <PipelineBuilder
          pipeline={pipeline}
          workers={workers}
          onSavePipeline={handleSavePipeline}
          onDeletePipeline={handleDeletePipeline}
          calculationsByWorker={calculationsByWorker}
          quarter={quarter as Quarter}
          year={year}
          years={years}
          period={currentPeriod}
          onQuarterChange={setQuarter}
          onYearChange={setYear}
          onSaveBonus={handleSaveBonus}
          onBulkSaveBonuses={handleBulkSaveBonuses}
        />
      )}
    </div>
  );
}

export default function PipelinePage() {
  return (
    <RequireAuth>
      <PipelinePageContent />
    </RequireAuth>
  );
}
