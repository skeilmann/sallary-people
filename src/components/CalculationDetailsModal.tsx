'use client';

import { useTranslations, useLocale } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CalculationWithWorker } from '@/lib/types';
import { formatCurrency } from '@/lib/formulas';

interface CalculationDetailsModalProps {
  calculation: CalculationWithWorker | null;
  onClose: () => void;
}

export function CalculationDetailsModal({
  calculation,
  onClose,
}: CalculationDetailsModalProps) {
  const t = useTranslations('history');
  const locale = useLocale();

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  return (
    <Dialog open={!!calculation} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('detail.title')}</DialogTitle>
        </DialogHeader>
        {calculation && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{t('detail.worker')}</p>
                <p className="font-medium">{calculation.worker?.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('detail.period')}</p>
                <p className="font-medium">{calculation.period}</p>
              </div>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">{t('detail.inputs')}</p>
              <div className="bg-muted p-3 rounded space-y-1">
                {Object.entries(calculation.inputs)
                  .filter(([key]) => key !== 'returns' && key !== 'chargebacks' && key !== 'discounts')
                  .map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="capitalize">{key.replace('_', ' ')}</span>
                      <span>{typeof value === 'number' ? formatCurrency(value) : value}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div>
                <p className="text-sm text-muted-foreground">{t('detail.calculated')}</p>
                <p className="font-medium">{formatCurrency(calculation.calculated_amount)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('detail.adjustment')}</p>
                <p
                  className={`font-medium ${
                    calculation.adjustment_amount > 0
                      ? 'text-green-600'
                      : calculation.adjustment_amount < 0
                      ? 'text-red-600'
                      : ''
                  }`}
                >
                  {calculation.adjustment_amount !== 0
                    ? `${calculation.adjustment_amount > 0 ? '+' : ''}${formatCurrency(
                        calculation.adjustment_amount,
                      )}`
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('detail.final')}</p>
                <p className="text-lg font-bold">{formatCurrency(calculation.final_amount)}</p>
              </div>
            </div>

            {calculation.adjustment_note && (
              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground">{t('detail.adjustmentNote')}</p>
                <p className="text-sm mt-1 p-2 bg-muted rounded">{calculation.adjustment_note}</p>
              </div>
            )}

            <div className="text-xs text-muted-foreground pt-2">
              {t('detail.calculatedOn', { date: formatDate(calculation.created_at) })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
