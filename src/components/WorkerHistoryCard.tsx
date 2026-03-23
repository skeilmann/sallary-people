'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

  // Show all calculations when expanded
  const displayedCalculations = calculations;

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
    return null;
  }

  return (
    <Card className="border-dashed">
      <CardContent className="py-2 px-4">
        <button
          type="button"
          className="w-full flex items-center justify-between text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="text-sm text-muted-foreground">
            {t('historyFor', { name: worker.name })}
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {t('calculationsCount', { count: calculations.length })}
            </Badge>
            <span className="text-muted-foreground text-xs">
              {expanded ? '▲' : '▼'}
            </span>
          </div>
        </button>

        {expanded && (
          <div className="space-y-2 mt-3">
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

          </div>
        )}
      </CardContent>
    </Card>
  );
}
