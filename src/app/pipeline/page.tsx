'use client';

import { useEffect, useState, useCallback } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { PipelineBuilder } from '@/components/pipeline/PipelineBuilder';
import type { Worker } from '@/lib/types';
import type { CalculationPipeline, PipelineRow } from '@/lib/pipeline-types';
import {
  getWorkers,
  getDefaultPipeline,
  createPipeline,
  updatePipeline,
  deletePipeline,
} from '@/lib/supabase';
import { generateDefaultPipeline } from '@/lib/pipeline-utils';

function PipelinePageContent() {
  const t = useTranslations('pipeline');
  const tCommon = useTranslations('common');

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [pipeline, setPipeline] = useState<CalculationPipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasNoPipeline, setHasNoPipeline] = useState(false);

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

  const handleSave = useCallback(async (rows: PipelineRow[], name: string) => {
    if (pipeline) {
      const updated = await updatePipeline(pipeline.id, { rows, name });
      setPipeline(updated);
    } else {
      const created = await createPipeline({ rows, name });
      setPipeline(created);
      setHasNoPipeline(false);
    }
  }, [pipeline]);

  const handleDelete = useCallback(async () => {
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
          onSave={handleSave}
          onDelete={handleDelete}
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
