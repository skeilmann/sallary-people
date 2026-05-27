'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Worker } from '@/lib/types';
import { describeFormulaTranslated } from '@/lib/formulas';

interface WorkerCardProps {
  worker: Worker;
  onEdit: (worker: Worker) => void;
  onDelete: (worker: Worker) => void;
  onCalculate: (worker: Worker) => void;
}

export function WorkerCard({ worker, onEdit, onDelete, onCalculate }: WorkerCardProps) {
  const t = useTranslations('workers');
  const tCommon = useTranslations('common');
  const config = worker.formula_config;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between gap-4">
          {/* Name + formula summary */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onEdit(worker)}
              className="font-semibold hover:underline hover:text-primary transition-colors text-left whitespace-nowrap"
            >
              {worker.name}
            </button>
            <span className="text-sm text-muted-foreground truncate hidden sm:inline">
              {describeFormulaTranslated(config, t)}
            </span>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant="outline" className="hidden md:inline-flex">
              {t('formula.commission', { rate: config.commissionRate })}
            </Badge>
            {config.deductSalary && config.salaryAmount ? (
              <Badge variant="outline" className="text-blue-600 border-blue-300 hidden lg:inline-flex">
                -{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(config.salaryAmount)}
              </Badge>
            ) : null}
          </div>

          {/* Actions */}
          <div className="flex gap-1 flex-shrink-0">
            <Button size="sm" variant="ghost" onClick={() => onCalculate(worker)}>
              {t('calculateBonus')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onEdit(worker)}>
              {tCommon('edit')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => onDelete(worker)}
            >
              {tCommon('delete')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
