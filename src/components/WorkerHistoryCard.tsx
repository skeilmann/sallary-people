'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { Worker, CalculationWithWorker } from '@/lib/types';
import { getCalculations } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formulas';

interface WorkerHistoryCardProps {
  worker: Worker;
  selectedCalculationIds: Set<string>;
  onSelectionChange: (calculationId: string, selected: boolean) => void;
  maxSelections?: number;
}

export function WorkerHistoryCard({
  worker,
  selectedCalculationIds,
  onSelectionChange,
  maxSelections = 3,
}: WorkerHistoryCardProps) {
  const t = useTranslations('workerHistory');
  const tCommon = useTranslations('common');

  const [calculations, setCalculations] = useState<CalculationWithWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadCalculations();
  }, [worker.id]);

  const loadCalculations = async () => {
    try {
      const data = await getCalculations({ workerId: worker.id });
      setCalculations(data);
    } catch (error) {
      console.error('Failed to load calculations:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const totalSelected = selectedCalculationIds.size;
  const canSelectMore = totalSelected < maxSelections;

  // Show first 3 calculations, or all if expanded
  const displayedCalculations = expanded ? calculations : calculations.slice(0, 3);

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-4 text-center text-muted-foreground">
          {tCommon('loading')}
        </CardContent>
      </Card>
    );
  }

  if (calculations.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">
            {t('historyFor', { name: worker.name })}
          </CardTitle>
        </CardHeader>
        <CardContent className="py-4 text-center text-muted-foreground text-sm">
          {t('noHistory')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">
            {t('historyFor', { name: worker.name })}
          </CardTitle>
          <Badge variant="secondary">
            {t('calculationsCount', { count: calculations.length })}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {displayedCalculations.map((calc) => {
          const isSelected = selectedCalculationIds.has(calc.id);
          const canSelect = isSelected || canSelectMore;

          return (
            <div
              key={calc.id}
              className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${
                isSelected
                  ? 'bg-primary/5 border-primary'
                  : 'hover:bg-muted/50'
              }`}
            >
              <Checkbox
                checked={isSelected}
                disabled={!canSelect}
                onCheckedChange={(checked) => {
                  onSelectionChange(calc.id, checked === true);
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {calc.period}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(calc.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-semibold">
                    {formatCurrency(calc.final_amount)}
                  </span>
                  {calc.adjustment_amount !== 0 && (
                    <Badge
                      variant="outline"
                      className={
                        calc.adjustment_amount > 0
                          ? 'text-green-600 border-green-300'
                          : 'text-red-600 border-red-300'
                      }
                    >
                      {calc.adjustment_amount > 0 ? '+' : ''}
                      {formatCurrency(calc.adjustment_amount)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {calculations.length > 3 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded
              ? t('showLess')
              : t('showMore', { count: calculations.length - 3 })}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
