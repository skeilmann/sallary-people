'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg">{worker.name}</CardTitle>
          <Badge variant="secondary">
            {t(`metrics.${config.baseMetric}`)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          {describeFormulaTranslated(config, t)}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          <Badge variant="outline">
            {t('formula.commission', { rate: config.commissionRate })}
          </Badge>
          {config.deductions.map((d) => (
            <Badge key={d} variant="outline" className="text-orange-600 border-orange-300">
              -{t(`deductionLabels.${d}`)}
            </Badge>
          ))}
          {config.bonusThresholds.map((threshold, i) => (
            <Badge key={i} variant="outline" className="text-green-600 border-green-300">
              +{threshold.extraRate}% &gt;${threshold.above.toLocaleString()}
            </Badge>
          ))}
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => onCalculate(worker)}
            className="flex-1"
          >
            {t('calculateBonus')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEdit(worker)}
          >
            {tCommon('edit')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => onDelete(worker)}
          >
            {tCommon('delete')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
