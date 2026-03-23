'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CalculationWithWorker } from '@/lib/types';
import { formatCurrency } from '@/lib/formulas';

interface ComparisonViewProps {
  calculations: CalculationWithWorker[];
}

export function ComparisonView({ calculations }: ComparisonViewProps) {
  const t = useTranslations('history');
  const tComparison = useTranslations('comparison');

  if (calculations.length < 2) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t('compare.selectAtLeast')}
      </div>
    );
  }

  // Get all unique input keys across all calculations
  const allInputKeys = Array.from(
    new Set(calculations.flatMap((c) => Object.keys(c.inputs)))
  );

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {calculations.map((calc) => (
        <Card key={calc.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{calc.worker?.name}</CardTitle>
              <Badge variant="outline">{calc.period}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Inputs */}
            <div>
              <p className="text-xs text-muted-foreground mb-2 uppercase">{tComparison('inputs')}</p>
              <div className="space-y-1">
                {allInputKeys.map((key) => {
                  const value = calc.inputs[key as keyof typeof calc.inputs];
                  return (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="capitalize text-muted-foreground">
                        {key.replace('_', ' ')}
                      </span>
                      <span>
                        {value !== undefined ? formatCurrency(value as number) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Results */}
            <div className="pt-4 border-t">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">{t('table.calculated')}</span>
                <span>{formatCurrency(calc.calculated_amount)}</span>
              </div>
              {calc.adjustment_amount !== 0 && (
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">{t('table.adjustment')}</span>
                  <span
                    className={
                      calc.adjustment_amount > 0 ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    {calc.adjustment_amount > 0 ? '+' : ''}
                    {formatCurrency(calc.adjustment_amount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2 border-t mt-2">
                <span>{tComparison('final')}</span>
                <span>{formatCurrency(calc.final_amount)}</span>
              </div>
            </div>

            {/* Note */}
            {calc.adjustment_note && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">{tComparison('note')}</p>
                <p className="text-xs mt-1">{calc.adjustment_note}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
