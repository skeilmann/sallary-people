'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DynamicBonusForm } from '@/components/DynamicBonusForm';
import type { Worker, CalculationInputs } from '@/lib/types';
import { getWorkers, createCalculation } from '@/lib/supabase';

function CalculatePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('calculate');
  const tCommon = useTranslations('common');
  const initialWorkerId = searchParams.get('workerId') || undefined;

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkers();
  }, []);

  const loadWorkers = async () => {
    try {
      const data = await getWorkers();
      setWorkers(data);
    } catch (error) {
      console.error('Failed to load workers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (data: {
    workerId: string;
    period: string;
    inputs: CalculationInputs;
    calculatedAmount: number;
    adjustmentAmount: number;
    adjustmentNote: string;
    finalAmount: number;
  }) => {
    await createCalculation({
      worker_id: data.workerId,
      period: data.period,
      inputs: data.inputs,
      calculated_amount: data.calculatedAmount,
      adjustment_amount: data.adjustmentAmount,
      adjustment_note: data.adjustmentNote || null,
      final_amount: data.finalAmount,
    });

    router.push('/history');
  };

  const handleCancel = () => {
    router.push('/');
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <div className="text-center py-12 text-muted-foreground">{tCommon('loading')}</div>
      </div>
    );
  }

  if (workers.length === 0) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">
            {t('noWorkers')}
          </p>
          <button
            onClick={() => router.push('/workers')}
            className="text-primary underline"
          >
            {t('goToWorkers')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      <DynamicBonusForm
        workers={workers}
        initialWorkerId={initialWorkerId}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </div>
  );
}

function LoadingFallback() {
  const tCommon = useTranslations('common');
  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="text-center py-12 text-muted-foreground">{tCommon('loading')}</div>
    </div>
  );
}

export default function CalculatePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <CalculatePageContent />
    </Suspense>
  );
}
