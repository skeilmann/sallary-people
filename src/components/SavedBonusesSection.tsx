'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SavedBonusRow } from './SavedBonusRow';
import { CalculationDetailsModal } from './CalculationDetailsModal';
import type { Worker, CalculationWithWorker } from '@/lib/types';

interface SavedBonusesSectionProps {
  workers: Worker[];
  calculationsByWorker: Record<string, CalculationWithWorker[]>;
  period: string;
}

export function SavedBonusesSection({
  workers,
  calculationsByWorker,
  period,
}: SavedBonusesSectionProps) {
  const t = useTranslations('dashboard');
  const [viewing, setViewing] = useState<CalculationWithWorker | null>(null);

  if (workers.length === 0) return null;

  return (
    <>
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>{t('savedBonusesFor', { period })}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('savedBonusesForSubtitle')}</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {workers.map((worker) => (
              <SavedBonusRow
                key={worker.id}
                worker={worker}
                calculations={calculationsByWorker[worker.id] ?? []}
                onView={(calc) => setViewing(calc)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <CalculationDetailsModal
        calculation={viewing}
        onClose={() => setViewing(null)}
      />
    </>
  );
}
