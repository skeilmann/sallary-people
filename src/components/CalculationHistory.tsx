'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { CalculationWithWorker } from '@/lib/types';
import { CalculationDetailsModal } from './CalculationDetailsModal';
import { formatCurrency } from '@/lib/formulas';

interface CalculationHistoryProps {
  calculations: CalculationWithWorker[];
  onDelete?: (id: string) => void;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

export function CalculationHistory({
  calculations,
  onDelete,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
}: CalculationHistoryProps) {
  const t = useTranslations('history');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [detailCalc, setDetailCalc] = useState<CalculationWithWorker | null>(null);

  const toggleSelection = (id: string) => {
    if (!onSelectionChange) return;
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((i) => i !== id));
    } else if (selectedIds.length < 3) {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (calculations.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed rounded-lg">
        <p className="text-muted-foreground">{t('noCalculations')}</p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            {selectable && <TableHead className="w-12"></TableHead>}
            <TableHead>{t('table.worker')}</TableHead>
            <TableHead>{t('table.period')}</TableHead>
            <TableHead className="text-right">{t('table.calculated')}</TableHead>
            <TableHead className="text-right">{t('table.adjustment')}</TableHead>
            <TableHead className="text-right">{t('table.final')}</TableHead>
            <TableHead>{t('table.date')}</TableHead>
            <TableHead className="w-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {calculations.map((calc) => (
            <TableRow
              key={calc.id}
              className={selectedIds.includes(calc.id) ? 'bg-muted' : ''}
            >
              {selectable && (
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(calc.id)}
                    onChange={() => toggleSelection(calc.id)}
                    className="rounded"
                    disabled={!selectedIds.includes(calc.id) && selectedIds.length >= 3}
                  />
                </TableCell>
              )}
              <TableCell className="font-medium">{calc.worker?.name}</TableCell>
              <TableCell>
                <Badge variant="outline">{calc.period}</Badge>
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(calc.calculated_amount)}
              </TableCell>
              <TableCell className="text-right">
                {calc.adjustment_amount !== 0 ? (
                  <span
                    className={
                      calc.adjustment_amount > 0 ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    {calc.adjustment_amount > 0 ? '+' : ''}
                    {formatCurrency(calc.adjustment_amount)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right font-semibold">
                {formatCurrency(calc.final_amount)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(calc.created_at)}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDetailCalc(calc)}
                  >
                    {tCommon('view')}
                  </Button>
                  {onDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                      onClick={() => {
                        if (confirm(t('deleteConfirm'))) {
                          onDelete(calc.id);
                        }
                      }}
                    >
                      ×
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <CalculationDetailsModal
        calculation={detailCalc}
        onClose={() => setDetailCalc(null)}
      />
    </>
  );
}
