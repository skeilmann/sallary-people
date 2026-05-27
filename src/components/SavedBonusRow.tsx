'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { Worker, CalculationWithWorker } from '@/lib/types';
import { formatCurrency } from '@/lib/formulas';

interface SavedBonusRowProps {
  worker: Worker;
  calculations: CalculationWithWorker[];
  onView: (calc: CalculationWithWorker) => void;
}

export function SavedBonusRow({ worker, calculations, onView }: SavedBonusRowProps) {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  if (calculations.length === 0) {
    return (
      <div className="flex items-baseline justify-between gap-4 rounded-lg border border-dashed bg-muted/30 px-4 py-3">
        <div>
          <p className="font-medium">{worker.name}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{t('noSavedBonusForPeriod')}</p>
        </div>
      </div>
    );
  }

  const latest = calculations[0];
  const earlier = calculations.slice(1);

  const renderSubtitle = (calc: CalculationWithWorker) => {
    const inputs = calc.inputs;
    const isIndividual = inputs.individualRevenue !== undefined && inputs.individualRevenue !== null;
    const baseValueLine = isIndividual
      ? t('personalRevenueLine', { amount: formatCurrency(inputs.individualRevenue ?? 0) })
      : t('companyRevenueLine', { amount: formatCurrency(inputs.baseValue ?? 0) });

    const salaryLine =
      inputs.salary !== undefined && inputs.salary > 0
        ? ` ${t('minusSalary', { amount: formatCurrency(inputs.salary) })}`
        : '';

    const adj = calc.adjustment_amount;
    let adjustmentLine = '';
    if (adj > 0) {
      adjustmentLine = ` ${t('plusAdjustment', { amount: formatCurrency(adj) })}`;
    } else if (adj < 0) {
      adjustmentLine = ` ${t('minusAdjustment', { amount: formatCurrency(Math.abs(adj)) })}`;
    }

    return `${baseValueLine}${salaryLine}${adjustmentLine}`;
  };

  return (
    <div className="rounded-lg border bg-muted/30">
      {/* Latest version row */}
      <div className="flex items-start justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <p className="font-medium">{worker.name}</p>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">{renderSubtitle(latest)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('savedOn', { date: formatDate(latest.created_at) })}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-lg font-bold tabular-nums">
            {formatCurrency(latest.final_amount)}
          </span>
          <Button variant="outline" size="sm" onClick={() => onView(latest)}>
            {t('viewDetails')}
          </Button>
        </div>
      </div>

      {/* Earlier versions toggle */}
      {earlier.length > 0 && (
        <div className="border-t px-4 py-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded
              ? t('hideEarlierVersions')
              : t('nEarlierVersions', { count: earlier.length })}
          </button>

          {expanded && (
            <ul className="mt-2 space-y-1">
              {earlier.map((calc) => (
                <li
                  key={calc.id}
                  className="flex items-center justify-between gap-3 rounded border bg-background px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground truncate">{renderSubtitle(calc)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {t('savedOn', { date: formatDate(calc.created_at) })}
                    </p>
                  </div>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(calc.final_amount)}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => onView(calc)}>
                    {t('viewDetails')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
