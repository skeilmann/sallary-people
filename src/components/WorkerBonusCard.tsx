'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import type { Worker, GlobalCalculationInputs } from '@/lib/types';
import {
  formatCurrency,
  calculateBonusWithGlobalInputs,
  getCalculationBreakdown,
  getEffectiveSalary,
  calculateFinalAmount,
} from '@/lib/formulas';

interface WorkerBonusCardProps {
  worker: Worker;
  globalInputs: GlobalCalculationInputs;
  // For workers with individual revenue source
  individualRevenue?: number;
  onIndividualRevenueChange?: (value: number) => void;
  /** When a pipeline is active, the commission is pre-computed by the engine */
  pipelineCommissionAmount?: number;
  /** When a pipeline is active, show the base amount used for this worker */
  pipelineBaseAmount?: number;
  onSave: (data: {
    workerId: string;
    calculatedAmount: number;
    adjustmentAmount: number;
    adjustmentNote: string;
    finalAmount: number;
    salary: number;
    individualRevenue?: number;
  }) => void;
}

export function WorkerBonusCard({
  worker,
  globalInputs,
  individualRevenue = 0,
  onIndividualRevenueChange,
  pipelineCommissionAmount,
  pipelineBaseAmount,
  onSave,
}: WorkerBonusCardProps) {
  const t = useTranslations('bonusCard');
  const tCommon = useTranslations('common');

  const [isOpen, setIsOpen] = useState(false);
  const [salary, setSalary] = useState(worker.formula_config.salaryAmount || 0);
  const [adjustmentPercent, setAdjustmentPercent] = useState(0);
  const [adjustmentNote, setAdjustmentNote] = useState('');

  // Sync salary when worker config changes (e.g. after editing worker settings)
  useEffect(() => {
    setSalary(worker.formula_config.salaryAmount || 0);
  }, [worker.formula_config.salaryAmount]);

  const config = worker.formula_config;
  const isIndividualRevenue = config.revenueSource === 'individual';
  const isPipelineMode = pipelineCommissionAmount !== undefined;

  // Calculate bonus with current values
  // When pipeline is active, use the pre-computed commission amount
  const workerInputs = { salary, individualRevenue };
  const calculatedAmount = isPipelineMode
    ? pipelineCommissionAmount
    : calculateBonusWithGlobalInputs(config, globalInputs, workerInputs);
  const adjustmentAmount = Math.round(calculatedAmount * (adjustmentPercent / 100) * 100) / 100;
  const finalAmount = calculateFinalAmount(calculatedAmount, adjustmentAmount);

  // Get breakdown for display (only used in non-pipeline mode dialog)
  const breakdown = isPipelineMode ? null : getCalculationBreakdown(config, globalInputs, workerInputs);

  const handleSave = () => {
    if (adjustmentPercent !== 0 && !adjustmentNote.trim()) {
      alert(t('adjustmentNoteRequired'));
      return;
    }

    onSave({
      workerId: worker.id,
      calculatedAmount,
      adjustmentAmount,
      adjustmentNote: adjustmentNote.trim(),
      finalAmount,
      salary,
      individualRevenue: isIndividualRevenue ? individualRevenue : undefined,
    });

    setIsOpen(false);
    setAdjustmentPercent(0);
    setAdjustmentNote('');
  };

  const handleCancel = () => {
    setIsOpen(false);
    setSalary(worker.formula_config.salaryAmount || 0);
    setAdjustmentPercent(0);
    setAdjustmentNote('');
  };

  return (
    <>
      <Card
        className={`hover:shadow-md transition-shadow ${isIndividualRevenue ? 'border-blue-200' : ''}`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-lg">
              <Link href={`/workers?edit=${worker.id}`} className="hover:underline hover:text-primary transition-colors">
                {worker.name}
              </Link>
            </CardTitle>
            {isIndividualRevenue && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 text-xs">
                {t('individualRevenue')}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {config.commissionRate}% {t('commission')}
            {config.deductSalary && ` - ${t('minusSalary')}`}
            {config.applyTaxDeductions && ` - ${t('minusTaxes')}`}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Individual Revenue Input - shown on card for easy entry */}
          {isIndividualRevenue && (
            <div className="space-y-1">
              <Label htmlFor={`revenue-${worker.id}`} className="text-xs text-muted-foreground">
                {t('enterIndividualRevenue')}
              </Label>
              <Input
                id={`revenue-${worker.id}`}
                type="number"
                min="0"
                step="1000"
                value={individualRevenue || ''}
                onChange={(e) => onIndividualRevenueChange?.(parseFloat(e.target.value) || 0)}
                placeholder="0"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}

          <div
            className="cursor-pointer"
            onClick={() => setIsOpen(true)}
          >
            {config.deductSalary && (() => {
              const revenueDisplay = formatCurrency(
                breakdown?.totalRevenue ?? pipelineBaseAmount ?? globalInputs.totalRevenue,
              );
              const rawSalary = breakdown?.rawSalaryAmount ?? worker.formula_config.salaryAmount ?? 0;
              const effectiveSalary = breakdown?.salaryAmount ?? getEffectiveSalary(config, rawSalary);
              const isMonthly = config.salaryPeriod === 'monthly';
              return (
                <p className="text-xs text-muted-foreground mb-1">
                  {isMonthly
                    ? t('revenueAfterSalaryMonthly', {
                        revenue: revenueDisplay,
                        salary: formatCurrency(rawSalary),
                        effective: formatCurrency(effectiveSalary),
                      })
                    : t('revenueAfterSalary', {
                        revenue: revenueDisplay,
                        salary: formatCurrency(effectiveSalary),
                      })}
                </p>
              );
            })()}
            <div className="text-3xl font-bold text-primary">
              {formatCurrency(calculatedAmount)}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {t('clickToAdjust')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Detail/Edit Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              <Link href={`/workers?edit=${worker.id}`} className="hover:underline hover:text-primary transition-colors">
                {worker.name}
              </Link>
              {' '}- {t('bonusDetails')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Calculation Breakdown */}
            <div className="bg-muted p-4 rounded-lg space-y-2">
              {isPipelineMode ? (
                <>
                  {/* Pipeline mode: simplified breakdown showing base amount and result */}
                  <div className="flex justify-between text-sm">
                    <span>{isIndividualRevenue ? t('individualRevenue') : t('totalRevenue')}</span>
                    <span>{formatCurrency(pipelineBaseAmount ?? globalInputs.totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>× {config.commissionRate}%</span>
                    <span className="font-bold">{formatCurrency(calculatedAmount)}</span>
                  </div>
                </>
              ) : breakdown ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span>
                      {isIndividualRevenue ? t('individualRevenue') : t('totalRevenue')}
                    </span>
                    <span>{formatCurrency(breakdown.totalRevenue)}</span>
                  </div>

                  {config.deductSalary && (
                    <div className="flex justify-between text-sm text-red-600">
                      <span>
                        - {t('salary')}
                        {breakdown.salaryPeriodMonthly &&
                          ` (${formatCurrency(breakdown.rawSalaryAmount)}${t('perMonthShort')} × 3)`}
                      </span>
                      <span>-{formatCurrency(breakdown.salaryAmount)}</span>
                    </div>
                  )}

                  {config.applyTaxDeductions && (
                    config.workerTaxRate != null && config.workerTaxRate > 0 ? (
                      <div className="flex justify-between text-sm text-red-600">
                        <span>- {t('tax')} ({config.workerTaxRate}%)</span>
                        <span>-{formatCurrency(breakdown.workerTaxAmount)}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between text-sm text-red-600">
                          <span>- {t('tax')} 1 ({globalInputs.taxRate1}%)</span>
                          <span>-{formatCurrency(breakdown.tax1Amount)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-red-600">
                          <span>- {t('tax')} 2 ({globalInputs.taxRate2}%)</span>
                          <span>-{formatCurrency(breakdown.tax2Amount)}</span>
                        </div>
                      </>
                    )
                  )}

                  <div className="flex justify-between text-sm font-medium border-t pt-2">
                    <span>{t('netAmount')}</span>
                    <span>{formatCurrency(breakdown.netAmount)}</span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span>× {config.commissionRate}%</span>
                    <span className="font-bold">{formatCurrency(breakdown.bonusAmount)}</span>
                  </div>
                </>
              ) : null}
            </div>

            {/* Individual Revenue Input (in modal too for editing) */}
            {isIndividualRevenue && (
              <div className="space-y-2">
                <Label htmlFor="modal-revenue">{t('individualRevenue')}</Label>
                <Input
                  id="modal-revenue"
                  type="number"
                  min="0"
                  step="1000"
                  value={individualRevenue || ''}
                  onChange={(e) => onIndividualRevenueChange?.(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
            )}

            {/* Salary Input (if applicable) */}
            {config.deductSalary && (
              <div className="space-y-2">
                <Label htmlFor="salary">
                  {config.salaryPeriod === 'monthly'
                    ? t('salaryToDeductMonthly')
                    : t('salaryToDeduct')}
                </Label>
                <Input
                  id="salary"
                  type="number"
                  min="0"
                  step="100"
                  value={salary}
                  onChange={(e) => setSalary(parseFloat(e.target.value) || 0)}
                />
              </div>
            )}

            {/* Adjustment Slider */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>
                  {t('adjustment')}: {adjustmentPercent > 0 ? '+' : ''}{adjustmentPercent}%
                </Label>
                <span className="text-sm text-muted-foreground">
                  {adjustmentAmount > 0 ? '+' : ''}{formatCurrency(adjustmentAmount)}
                </span>
              </div>
              <Slider
                value={[adjustmentPercent]}
                onValueChange={([value]) => setAdjustmentPercent(value)}
                min={-20}
                max={20}
                step={1}
                className="py-4"
              />
            </div>

            {/* Adjustment Note */}
            {adjustmentPercent !== 0 && (
              <div className="space-y-2">
                <Label htmlFor="note">{t('adjustmentNote')}</Label>
                <Textarea
                  id="note"
                  value={adjustmentNote}
                  onChange={(e) => setAdjustmentNote(e.target.value)}
                  placeholder={t('adjustmentNotePlaceholder')}
                  rows={2}
                />
              </div>
            )}

            {/* Final Amount */}
            <div className="bg-primary/10 p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-medium">{t('finalBonus')}</span>
                <span className="text-2xl font-bold">{formatCurrency(finalAmount)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              {tCommon('cancel')}
            </Button>
            <Button onClick={handleSave}>
              {t('saveBonus')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
