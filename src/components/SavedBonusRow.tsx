'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { Worker, CalculationWithWorker } from '@/lib/types';
import { formatCurrency } from '@/lib/formulas';

interface SavedBonusRowProps {
  worker: Worker;
  calculation: CalculationWithWorker | undefined;
  onView: (calc: CalculationWithWorker) => void;
}

export function SavedBonusRow({ worker, calculation, onView }: SavedBonusRowProps) {
  const t = useTranslations('dashboard');
  const locale = useLocale();

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  // Empty state: worker has no saved calculation yet.
  if (!calculation) {
    return (
      <div className="flex items-baseline justify-between gap-4 rounded-lg border border-dashed bg-muted/30 px-4 py-3">
        <div>
          <p className="font-medium">{worker.name}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{t('noSavedBonus')}</p>
        </div>
      </div>
    );
  }

  // Compose the inputs line from stored data.
  const inputs = calculation.inputs;
  const isIndividual = inputs.individualRevenue !== undefined && inputs.individualRevenue !== null;
  const baseValueLine = isIndividual
    ? t('personalRevenueLine', { amount: formatCurrency(inputs.individualRevenue ?? 0) })
    : t('companyRevenueLine', { amount: formatCurrency(inputs.baseValue ?? 0) });

  const salaryLine =
    inputs.salary !== undefined && inputs.salary > 0
      ? ` ${t('minusSalary', { amount: formatCurrency(inputs.salary) })}`
      : '';

  const adj = calculation.adjustment_amount;
  let adjustmentLine = '';
  if (adj > 0) {
    adjustmentLine = ` ${t('plusAdjustment', { amount: formatCurrency(adj) })}`;
  } else if (adj < 0) {
    adjustmentLine = ` ${t('minusAdjustment', { amount: formatCurrency(Math.abs(adj)) })}`;
  }

  const subtitle = `${baseValueLine}${salaryLine}${adjustmentLine}`;
  const periodAndDate = `${calculation.period}  ·  ${t('savedOn', {
    date: formatDate(calculation.created_at),
  })}`;

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium">{worker.name}</p>
        <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>
        <p className="text-xs text-muted-foreground mt-1">{periodAndDate}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-lg font-bold tabular-nums">
          {formatCurrency(calculation.final_amount)}
        </span>
        <Button variant="outline" size="sm" onClick={() => onView(calculation)}>
          {t('viewDetails')}
        </Button>
      </div>
    </div>
  );
}
