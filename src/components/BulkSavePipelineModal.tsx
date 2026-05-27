'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import type { Worker } from '@/lib/types';
import type { PipelineExecutionResult } from '@/lib/pipeline-types';
import { formatCurrency, calculateFinalAmount } from '@/lib/formulas';

export interface BulkSaveRow {
  workerId: string;
  calculatedAmount: number;
  adjustmentAmount: number;
  adjustmentNote: string;
  finalAmount: number;
  salary: number;
  individualRevenue?: number;
}

export interface BulkSaveFailure {
  workerId: string;
  message: string;
}

interface BulkSavePipelineModalProps {
  open: boolean;
  onClose: () => void;
  workers: Worker[];
  pipelineResult: PipelineExecutionResult;
  individualRevenues: Record<string, number>;
  period: string;
  /**
   * Resolves with the per-worker failures (empty array on full success).
   * The modal stays open with the failing rows still visible if any fail.
   */
  onConfirm: (rows: BulkSaveRow[]) => Promise<BulkSaveFailure[]>;
}

interface RowState {
  adjustmentPercent: number;
  adjustmentNote: string;
}

export function BulkSavePipelineModal({
  open,
  onClose,
  workers,
  pipelineResult,
  individualRevenues,
  period,
  onConfirm,
}: BulkSavePipelineModalProps) {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const tBonusCard = useTranslations('bonusCard');

  // Snapshot pipeline amounts at modal-open time so editing inputs in the
  // background dashboard while the modal is open can't silently change what
  // we're about to save. (Plan §Gotchas.)
  const snapshot = useMemo(
    () =>
      workers.map((w) => ({
        worker: w,
        calculatedAmount: pipelineResult.workerCommissions[w.id] ?? 0,
        individualRevenue:
          w.formula_config.revenueSource === 'individual'
            ? individualRevenues[w.id] ?? 0
            : undefined,
        salary: w.formula_config.salaryAmount ?? 0,
      })),
    // Capture when modal opens; intentionally not reacting to live updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [failures, setFailures] = useState<BulkSaveFailure[]>([]);

  // Reset per-row state every time the modal is opened with a fresh worker set.
  useEffect(() => {
    if (open) {
      const next: Record<string, RowState> = {};
      for (const w of workers) {
        next[w.id] = { adjustmentPercent: 0, adjustmentNote: '' };
      }
      setRowState(next);
      setFailures([]);
    }
  }, [open, workers]);

  const updateRow = (workerId: string, patch: Partial<RowState>) => {
    setRowState((prev) => ({
      ...prev,
      [workerId]: { ...prev[workerId], ...patch },
    }));
  };

  const computeRow = (workerId: string, calculatedAmount: number) => {
    const state = rowState[workerId] ?? { adjustmentPercent: 0, adjustmentNote: '' };
    const adjustmentAmount =
      Math.round(calculatedAmount * (state.adjustmentPercent / 100) * 100) / 100;
    const finalAmount = calculateFinalAmount(calculatedAmount, adjustmentAmount);
    return { ...state, adjustmentAmount, finalAmount };
  };

  const grandTotal = snapshot.reduce(
    (sum, s) => sum + computeRow(s.worker.id, s.calculatedAmount).finalAmount,
    0,
  );

  const missingNotes = snapshot.filter((s) => {
    const r = computeRow(s.worker.id, s.calculatedAmount);
    return r.adjustmentPercent !== 0 && !r.adjustmentNote.trim();
  });

  const handleConfirm = async () => {
    if (missingNotes.length > 0) return;
    setSubmitting(true);
    const rows: BulkSaveRow[] = snapshot.map((s) => {
      const r = computeRow(s.worker.id, s.calculatedAmount);
      return {
        workerId: s.worker.id,
        calculatedAmount: s.calculatedAmount,
        adjustmentAmount: r.adjustmentAmount,
        adjustmentNote: r.adjustmentNote.trim(),
        finalAmount: r.finalAmount,
        salary: s.salary,
        individualRevenue: s.individualRevenue,
      };
    });
    const fails = await onConfirm(rows);
    setSubmitting(false);
    setFailures(fails);
    if (fails.length === 0) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !submitting) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('bulkSaveTitle')}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t('bulkSaveSubtitle', { period })}
          </p>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 py-2 pr-1">
          {snapshot.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{t('bulkSaveNoWorkers')}</p>
          ) : (
            <ul className="space-y-3">
              {snapshot.map((s) => {
                const row = computeRow(s.worker.id, s.calculatedAmount);
                const failure = failures.find((f) => f.workerId === s.worker.id);
                const noteMissing = row.adjustmentPercent !== 0 && !row.adjustmentNote.trim();
                return (
                  <li
                    key={s.worker.id}
                    className={`rounded-lg border p-3 ${
                      failure ? 'border-red-300 bg-red-50' : 'bg-muted/30'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-medium truncate">{s.worker.name}</p>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(s.calculatedAmount)}
                          {row.adjustmentAmount !== 0 && (
                            <>
                              {' '}
                              {row.adjustmentAmount > 0 ? '+' : '−'}{' '}
                              {formatCurrency(Math.abs(row.adjustmentAmount))}
                            </>
                          )}
                        </p>
                        <p className="text-base font-bold tabular-nums">
                          {formatCurrency(row.finalAmount)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-3 items-center">
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {tBonusCard('adjustment')}: {row.adjustmentPercent > 0 ? '+' : ''}
                          {row.adjustmentPercent}%
                        </Label>
                        <Slider
                          value={[row.adjustmentPercent]}
                          onValueChange={([v]) =>
                            updateRow(s.worker.id, { adjustmentPercent: v })
                          }
                          min={-20}
                          max={20}
                          step={1}
                          disabled={submitting}
                          className="py-2"
                        />
                      </div>
                      <div>
                        <Input
                          type="text"
                          value={row.adjustmentNote}
                          onChange={(e) =>
                            updateRow(s.worker.id, { adjustmentNote: e.target.value })
                          }
                          placeholder={
                            row.adjustmentPercent !== 0
                              ? tBonusCard('adjustmentNotePlaceholder')
                              : ''
                          }
                          disabled={row.adjustmentPercent === 0 || submitting}
                          className={noteMissing ? 'border-red-400' : ''}
                        />
                        {noteMissing && (
                          <p className="text-xs text-red-600 mt-1">
                            {tBonusCard('adjustmentNoteRequired')}
                          </p>
                        )}
                      </div>
                    </div>

                    {failure && (
                      <p className="text-xs text-red-700 mt-2">{failure.message}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-sm font-medium">
            {t('bulkSaveTotalRow', { amount: formatCurrency(grandTotal) })}
          </span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting || snapshot.length === 0 || missingNotes.length > 0}
          >
            {submitting ? tCommon('loading') : t('bulkSaveConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
