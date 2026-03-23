'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CalculationWithWorker } from '@/lib/types';
import { formatCurrency } from '@/lib/formulas';

interface HistoricalComparisonCardProps {
  calculation: CalculationWithWorker;
  onRemove: (id: string) => void;
}

export function HistoricalComparisonCard({
  calculation,
  onRemove,
}: HistoricalComparisonCardProps) {
  const t = useTranslations('historicalComparison');
  const tCommon = useTranslations('common');

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">
              <Link href={`/workers?edit=${calculation.worker.id}`} className="hover:underline hover:text-primary transition-colors">
                {calculation.worker.name}
              </Link>
            </CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="bg-blue-100">
                {calculation.period}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatDate(calculation.created_at)}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:text-red-700 hover:bg-red-50 h-6 w-6 p-0"
            onClick={() => onRemove(calculation.id)}
          >
            ×
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Inputs breakdown */}
        <div className="text-sm text-muted-foreground mb-2 space-y-1">
          {calculation.inputs.baseValue > 0 && (
            <div className="flex justify-between">
              <span>{t('baseValue')}</span>
              <span>{formatCurrency(calculation.inputs.baseValue)}</span>
            </div>
          )}
          {calculation.inputs.salary && calculation.inputs.salary > 0 && (
            <div className="flex justify-between">
              <span>{t('salary')}</span>
              <span>-{formatCurrency(calculation.inputs.salary)}</span>
            </div>
          )}
        </div>

        {/* Calculated amount */}
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm">{t('calculated')}</span>
          <span className="font-medium">{formatCurrency(calculation.calculated_amount)}</span>
        </div>

        {/* Adjustment if any */}
        {calculation.adjustment_amount !== 0 && (
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm">{t('adjustment')}</span>
            <Badge
              variant="outline"
              className={
                calculation.adjustment_amount > 0
                  ? 'text-green-600 border-green-300'
                  : 'text-red-600 border-red-300'
              }
            >
              {calculation.adjustment_amount > 0 ? '+' : ''}
              {formatCurrency(calculation.adjustment_amount)}
            </Badge>
          </div>
        )}

        {/* Final amount */}
        <div className="border-t pt-2 mt-2">
          <div className="flex justify-between items-center">
            <span className="font-medium">{t('final')}</span>
            <span className="text-2xl font-bold text-primary">
              {formatCurrency(calculation.final_amount)}
            </span>
          </div>
        </div>

        {/* Adjustment note if any */}
        {calculation.adjustment_note && (
          <div className="mt-2 p-2 bg-white rounded text-xs text-muted-foreground">
            <strong>{t('note')}:</strong> {calculation.adjustment_note}
          </div>
        )}

        <Badge variant="secondary" className="mt-3 w-full justify-center">
          {t('historical')}
        </Badge>
      </CardContent>
    </Card>
  );
}
