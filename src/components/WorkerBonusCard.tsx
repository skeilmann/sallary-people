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
import { Checkbox } from '@/components/ui/checkbox';
import type { Worker, GlobalCalculationInputs, FormulaConfig } from '@/lib/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  /**
   * Effective salary the pipeline deducted for this worker this run (after the
   * monthly ×3 conversion if applicable). > 0 means a salary card is in the
   * active pipeline for this worker. Used to drive the "− salariu" label and
   * the breakdown line — replaces the legacy `config.deductSalary` check.
   */
  pipelineSalaryDeducted?: number;
  /**
   * Latest saved calculation for the currently selected period, used to
   * pre-fill the editing modal (salary, adjustment slider, note). When null
   * or undefined, the card shows fresh defaults from the worker's config.
   */
  savedSnapshot?: {
    id: string;
    salary?: number;
    adjustmentAmount: number;
    adjustmentNote: string | null;
    calculatedAmount: number;
  } | null;
  /** When true, shows the selection checkbox (typically pipeline-mode only). */
  showSelectionCheckbox?: boolean;
  isSelected?: boolean;
  onSelectionChange?: (selected: boolean) => void;
  onSave: (data: {
    workerId: string;
    calculatedAmount: number;
    adjustmentAmount: number;
    adjustmentNote: string;
    finalAmount: number;
    salary: number;
    individualRevenue?: number;
  }) => void;
  /** Persist edits to the worker profile from the bonus dialog. When omitted,
   *  the worker-settings panel in the dialog is hidden. */
  onUpdateWorker?: (
    workerId: string,
    data: { name: string; formula_config: FormulaConfig },
  ) => Promise<void>;
}

export function WorkerBonusCard({
  worker,
  globalInputs,
  individualRevenue = 0,
  onIndividualRevenueChange,
  pipelineCommissionAmount,
  pipelineBaseAmount,
  pipelineSalaryDeducted,
  savedSnapshot,
  showSelectionCheckbox,
  isSelected,
  onSelectionChange,
  onSave,
  onUpdateWorker,
}: WorkerBonusCardProps) {
  const t = useTranslations('bonusCard');
  const tCommon = useTranslations('common');
  const tDashboard = useTranslations('dashboard');
  const tWorkers = useTranslations('workers');

  const [isOpen, setIsOpen] = useState(false);
  const [salary, setSalary] = useState(worker.formula_config.salaryAmount || 0);
  // Dollar amount is the source of truth; the slider's percent is derived
  // from this each render so editing either input updates the other.
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [adjustmentNote, setAdjustmentNote] = useState('');

  // Local edit buffer for the worker-settings panel inside the dialog. The
  // panel only persists changes when the user clicks "Update Worker", so the
  // bonus calculation above is unaffected until then.
  const [editName, setEditName] = useState(worker.name);
  const [editCommissionRate, setEditCommissionRate] = useState(
    worker.formula_config.commissionRate,
  );
  const [editSalaryAmount, setEditSalaryAmount] = useState(
    worker.formula_config.salaryAmount ?? 0,
  );
  const [editSalaryPeriod, setEditSalaryPeriod] = useState<'monthly' | 'quarterly'>(
    worker.formula_config.salaryPeriod ?? 'quarterly',
  );
  const [editRevenueSource, setEditRevenueSource] = useState<'global' | 'individual'>(
    worker.formula_config.revenueSource ?? 'global',
  );
  const [savingWorker, setSavingWorker] = useState(false);
  const [workerSettingsOpen, setWorkerSettingsOpen] = useState(false);

  // Reset the worker-settings buffer whenever the worker prop changes (e.g.
  // after a successful save propagates new data, or when switching periods).
  useEffect(() => {
    setEditName(worker.name);
    setEditCommissionRate(worker.formula_config.commissionRate);
    setEditSalaryAmount(worker.formula_config.salaryAmount ?? 0);
    setEditSalaryPeriod(worker.formula_config.salaryPeriod ?? 'quarterly');
    setEditRevenueSource(worker.formula_config.revenueSource ?? 'global');
  }, [
    worker.name,
    worker.formula_config.commissionRate,
    worker.formula_config.salaryAmount,
    worker.formula_config.salaryPeriod,
    worker.formula_config.revenueSource,
  ]);

  // Sync salary when worker config changes (e.g. after editing worker settings)
  useEffect(() => {
    setSalary(worker.formula_config.salaryAmount || 0);
  }, [worker.formula_config.salaryAmount]);

  // Pre-fill editor state from the saved snapshot for the selected period.
  // Effect runs only when the snapshot identity changes (per-quarter switch
  // or after a fresh save), so it doesn't clobber in-progress local edits.
  useEffect(() => {
    if (savedSnapshot) {
      setSalary(savedSnapshot.salary ?? worker.formula_config.salaryAmount ?? 0);
      setAdjustmentAmount(savedSnapshot.adjustmentAmount);
      setAdjustmentNote(savedSnapshot.adjustmentNote ?? '');
    } else {
      setAdjustmentAmount(0);
      setAdjustmentNote('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSnapshot?.id]);

  const config = worker.formula_config;
  const isIndividualRevenue = config.revenueSource === 'individual';
  const isPipelineMode = pipelineCommissionAmount !== undefined;

  // Calculate bonus with current values
  // When pipeline is active, use the pre-computed commission amount
  const workerInputs = { salary, individualRevenue };
  const calculatedAmount = isPipelineMode
    ? pipelineCommissionAmount
    : calculateBonusWithGlobalInputs(config, globalInputs, workerInputs);
  // Derive percent from the dollar amount; clamp slider to ±20% for display
  // while preserving the raw percent in the label so larger fixed adjustments
  // are still visible (e.g. "+35%" with the knob parked at the +20% limit).
  const rawAdjustmentPercent =
    calculatedAmount > 0 ? Math.round((adjustmentAmount / calculatedAmount) * 100) : 0;
  const sliderAdjustmentPercent = Math.max(-20, Math.min(20, rawAdjustmentPercent));
  const finalAmount = calculateFinalAmount(calculatedAmount, adjustmentAmount);

  // Get breakdown for display (only used in non-pipeline mode dialog)
  const breakdown = isPipelineMode ? null : getCalculationBreakdown(config, globalInputs, workerInputs);

  // Worker's quarterly salary as a number, used both for the grand-total
  // display and as the basis for "+ salariu" labels. Reads the saved worker
  // config (NOT the local `salary` edit buffer above), since that buffer is
  // only used when a salary card is in the active pipeline.
  const quarterlySalary = getEffectiveSalary(
    config,
    worker.formula_config.salaryAmount ?? 0,
  );
  const grandTotal = calculatedAmount + quarterlySalary;

  const handleSaveWorker = async () => {
    if (!onUpdateWorker || !editName.trim()) return;
    setSavingWorker(true);
    try {
      const nextConfig: FormulaConfig = {
        ...config,
        commissionRate: editCommissionRate,
        salaryAmount: editSalaryAmount,
        salaryPeriod: editSalaryPeriod,
        revenueSource: editRevenueSource,
      };
      await onUpdateWorker(worker.id, {
        name: editName.trim(),
        formula_config: nextConfig,
      });
      setWorkerSettingsOpen(false);
    } finally {
      setSavingWorker(false);
    }
  };

  const handleSave = () => {
    if (adjustmentAmount !== 0 && !adjustmentNote.trim()) {
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
    setAdjustmentAmount(0);
    setAdjustmentNote('');
  };

  const handleCancel = () => {
    setIsOpen(false);
    // Reset to the snapshot for this period when one exists; otherwise to fresh defaults.
    if (savedSnapshot) {
      setSalary(savedSnapshot.salary ?? worker.formula_config.salaryAmount ?? 0);
      setAdjustmentAmount(savedSnapshot.adjustmentAmount);
      setAdjustmentNote(savedSnapshot.adjustmentNote ?? '');
    } else {
      setSalary(worker.formula_config.salaryAmount || 0);
      setAdjustmentAmount(0);
      setAdjustmentNote('');
    }
  };

  return (
    <>
      <Card
        className={`hover:shadow-md transition-shadow ${isIndividualRevenue ? 'border-blue-200' : ''}`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              {showSelectionCheckbox && (
                <Checkbox
                  checked={!!isSelected}
                  onCheckedChange={(checked) => onSelectionChange?.(checked === true)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={t('selectForBulkSave')}
                  className="mt-1"
                />
              )}
              <CardTitle className="text-lg">
                <Link href={`/workers?edit=${worker.id}`} className="hover:underline hover:text-primary transition-colors">
                  {worker.name}
                </Link>
              </CardTitle>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {savedSnapshot && (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 text-xs">
                  {t('viewingSavedQuarter')}
                </Badge>
              )}
              {isIndividualRevenue && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 text-xs">
                  {t('individualRevenue')}
                </Badge>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {config.commissionRate}% {t('commission')}
            {(pipelineSalaryDeducted ?? 0) > 0 && ` - ${t('minusSalary')}`}
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
            {(pipelineSalaryDeducted ?? 0) > 0 && (() => {
              const revenueDisplay = formatCurrency(
                pipelineBaseAmount ?? globalInputs.totalRevenue,
              );
              const rawSalary = worker.formula_config.salaryAmount ?? 0;
              const effectiveSalary = pipelineSalaryDeducted ?? getEffectiveSalary(config, rawSalary);
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
            {quarterlySalary > 0 && (
              <p
                className="text-[11px] text-muted-foreground/70 mt-0.5 tabular-nums"
                title={t('grandTotalTooltip', {
                  bonus: formatCurrency(calculatedAmount),
                  salary: formatCurrency(quarterlySalary),
                })}
              >
                {t('plusSalary', { amount: formatCurrency(quarterlySalary) })}
                {' · '}
                <span className="font-medium">
                  {t('grandTotalShort', { amount: formatCurrency(grandTotal) })}
                </span>
              </p>
            )}
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

                  {breakdown.salaryAmount > 0 && (
                    <div className="flex justify-between text-sm text-red-600">
                      <span>
                        - {t('salary')}
                        {breakdown.salaryPeriodMonthly &&
                          ` (${formatCurrency(breakdown.rawSalaryAmount)}${t('perMonthShort')} × 3)`}
                      </span>
                      <span>-{formatCurrency(breakdown.salaryAmount)}</span>
                    </div>
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

            {/* Salary Input — only when the pipeline actually deducts a salary for this worker */}
            {(pipelineSalaryDeducted ?? 0) > 0 && (
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

            {/* Adjustment — slider (% within ±20%) and fixed-dollar input.
                Both inputs share the same underlying amount; editing either
                updates the other. The dollar input can exceed ±20%; the
                slider visually clamps but the % label shows the true value. */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>
                  {t('adjustment')}: {rawAdjustmentPercent > 0 ? '+' : ''}{rawAdjustmentPercent}%
                </Label>
                <span className="text-sm text-muted-foreground">
                  {adjustmentAmount > 0 ? '+' : ''}{formatCurrency(adjustmentAmount)}
                </span>
              </div>
              <Slider
                value={[sliderAdjustmentPercent]}
                onValueChange={([value]) => {
                  const dollars =
                    Math.round(calculatedAmount * (value / 100) * 100) / 100;
                  setAdjustmentAmount(dollars);
                }}
                min={-20}
                max={20}
                step={1}
                className="py-2"
              />
              <div className="space-y-1">
                <Label htmlFor="adjustment-fixed" className="text-xs text-muted-foreground">
                  {tDashboard('adjustmentFixedLabel')}
                </Label>
                <Input
                  id="adjustment-fixed"
                  type="number"
                  step="1"
                  value={adjustmentAmount === 0 ? '' : adjustmentAmount}
                  onChange={(e) => setAdjustmentAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Adjustment Note */}
            {adjustmentAmount !== 0 && (
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
              {quarterlySalary > 0 && (
                <div className="flex justify-between items-center mt-1 text-xs text-muted-foreground/80 tabular-nums">
                  <span>
                    {t('plusSalary', { amount: formatCurrency(quarterlySalary) })}
                  </span>
                  <span className="font-medium">
                    {t('grandTotalShort', {
                      amount: formatCurrency(finalAmount + quarterlySalary),
                    })}
                  </span>
                </div>
              )}
            </div>

            {/* Worker Settings — collapsible, edits the worker profile in place.
                Saved separately from the bonus via its own "Update Worker"
                button so the two intents stay distinct. */}
            {onUpdateWorker && (
              <details
                open={workerSettingsOpen}
                onToggle={(e) => setWorkerSettingsOpen((e.target as HTMLDetailsElement).open)}
                className="border rounded-lg group"
              >
                <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground flex items-center justify-between">
                  <span>{t('workerSettings')}</span>
                  <span className="text-[10px] text-muted-foreground/70 group-open:hidden">
                    {config.commissionRate}%
                    {(worker.formula_config.salaryAmount ?? 0) > 0
                      && ` · ${formatCurrency(worker.formula_config.salaryAmount ?? 0)}${
                        (worker.formula_config.salaryPeriod ?? 'quarterly') === 'monthly'
                          ? t('perMonthShort')
                          : ''
                      }`}
                  </span>
                </summary>
                <div className="px-3 py-3 space-y-3 border-t bg-muted/30">
                  <div className="space-y-1.5">
                    <Label htmlFor={`ws-name-${worker.id}`} className="text-xs">
                      {tWorkers('form.name')}
                    </Label>
                    <Input
                      id={`ws-name-${worker.id}`}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`ws-rate-${worker.id}`} className="text-xs">
                      {tWorkers('form.commissionRate')}
                    </Label>
                    <Input
                      id={`ws-rate-${worker.id}`}
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={editCommissionRate}
                      onChange={(e) =>
                        setEditCommissionRate(parseFloat(e.target.value) || 0)
                      }
                      className="h-8 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`ws-salary-${worker.id}`} className="text-xs">
                        {tWorkers('form.defaultSalary')}
                      </Label>
                      <Input
                        id={`ws-salary-${worker.id}`}
                        type="number"
                        min="0"
                        step="100"
                        value={editSalaryAmount}
                        onChange={(e) =>
                          setEditSalaryAmount(parseFloat(e.target.value) || 0)
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        {tWorkers('form.salaryPeriod')}
                      </Label>
                      <Select
                        value={editSalaryPeriod}
                        onValueChange={(v) =>
                          setEditSalaryPeriod(v as 'monthly' | 'quarterly')
                        }
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="quarterly">
                            {tWorkers('form.salaryPeriodQuarterly')}
                          </SelectItem>
                          <SelectItem value="monthly">
                            {tWorkers('form.salaryPeriodMonthly')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      {tWorkers('form.revenueSource')}
                    </Label>
                    <Select
                      value={editRevenueSource}
                      onValueChange={(v) =>
                        setEditRevenueSource(v as 'global' | 'individual')
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">
                          {tWorkers('form.revenueSourceGlobal')}
                        </SelectItem>
                        <SelectItem value="individual">
                          {tWorkers('form.revenueSourceIndividual')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    size="sm"
                    className="text-xs w-full"
                    onClick={handleSaveWorker}
                    disabled={savingWorker || !editName.trim()}
                  >
                    {savingWorker
                      ? tWorkers('form.saving')
                      : t('saveWorkerSettings')}
                  </Button>
                </div>
              </details>
            )}
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
