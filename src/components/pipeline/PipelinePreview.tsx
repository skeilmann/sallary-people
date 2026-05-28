'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowDown, DollarSign, TrendingDown, User } from 'lucide-react';
import type { PipelineExecutionResult } from '@/lib/pipeline-types';
import { formatCurrency } from '@/lib/formulas';

interface PipelinePreviewProps {
  result: PipelineExecutionResult | null;
}

export function PipelinePreview({ result }: PipelinePreviewProps) {
  const t = useTranslations('pipeline');

  if (!result || result.startingRevenue === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{t('preview')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground italic">
            Enter revenue on the dashboard to see live preview
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{t('preview')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Starting revenue */}
        <div className="flex items-center justify-between p-2 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-600" />
            <span className="text-xs font-medium text-green-800">{t('revenue')}</span>
          </div>
          <span className="text-sm font-mono font-bold text-green-800">
            {formatCurrency(result.startingRevenue)}
          </span>
        </div>

        {/* Row-by-row breakdown */}
        {result.rowResults.map((rowResult, idx) => {
          const deductions = rowResult.itemResults.filter(
            ir => ir.type !== 'worker_commission' && ir.deductedAmount > 0
          );
          const commissions = rowResult.itemResults.filter(
            ir => ir.type === 'worker_commission' && (ir.commissionAmount ?? 0) > 0
          );

          if (deductions.length === 0 && commissions.length === 0) return null;

          return (
            <div key={rowResult.rowId}>
              <div className="flex justify-center py-1">
                <ArrowDown className="w-3.5 h-3.5 text-muted-foreground" />
              </div>

              <div className="space-y-1.5 pl-2 border-l-2 border-muted">
                <div className="text-[10px] font-semibold text-muted-foreground">
                  {t('rowLabel', { number: idx + 1 })} — {formatCurrency(rowResult.runningTotalBefore)}
                </div>

                {/* Deductions in this row */}
                {deductions.map((ir) => (
                  <div
                    key={ir.itemId}
                    className="flex items-center justify-between text-xs px-2 py-1 bg-red-50 rounded"
                  >
                    <div className="flex items-center gap-1.5">
                      <TrendingDown className="w-3 h-3 text-red-500" />
                      <span className="text-red-700">{ir.label}</span>
                    </div>
                    <span className="font-mono text-red-600">
                      -{formatCurrency(ir.deductedAmount)}
                    </span>
                  </div>
                ))}

                {/* Worker commissions in this row */}
                {commissions.map((ir) => (
                  <div
                    key={ir.itemId}
                    className="flex items-center justify-between text-xs px-2 py-1 bg-blue-50 rounded"
                  >
                    <div className="flex items-center gap-1.5">
                      <User className="w-3 h-3 text-blue-500" />
                      <span className="text-blue-700">{ir.workerName ?? ir.label}</span>
                    </div>
                    <span className="font-mono text-blue-600 font-medium">
                      {formatCurrency((ir.commissionAmount ?? 0) - (ir.nettedSalary ?? 0))}
                    </span>
                  </div>
                ))}

                {/* Row result */}
                {deductions.length > 0 && (
                  <div className="flex items-center justify-between text-xs px-2 pt-1 border-t border-muted">
                    <span className="text-muted-foreground">{t('afterDeductions')}</span>
                    <span className="font-mono font-medium">
                      {formatCurrency(rowResult.runningTotalAfter)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Final totals */}
        <div className="mt-4 pt-3 border-t-2 border-primary/20 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">{t('runningTotal')}</span>
            <span className="font-mono font-bold">
              {formatCurrency(result.finalRunningTotal)}
            </span>
          </div>

          {Object.entries(result.workerCommissions)
            .filter(([, amount]) => amount > 0)
            .map(([workerId, amount]) => {
              const breakdown = result.workerBreakdowns[workerId];
              return (
                <div
                  key={workerId}
                  className="flex items-center justify-between text-xs px-2 py-1.5 bg-blue-50 rounded-lg"
                >
                  <div>
                    <span className="text-blue-700 font-medium">
                      {breakdown ? `${breakdown.commissionRate}%` : ''} {t('earns')}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-blue-800">
                    {formatCurrency(amount)}
                  </span>
                </div>
              );
            })}
        </div>
      </CardContent>
    </Card>
  );
}
