'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PipelineItem, PipelineRow } from '@/lib/pipeline-types';
import type { Worker } from '@/lib/types';

interface EditItemDialogProps {
  item: PipelineItem | null;
  rows: PipelineRow[];
  workers: Worker[];
  onSave: (patch: Partial<PipelineItem>) => void;
  onClose: () => void;
}

export function EditItemDialog({
  item,
  rows,
  workers,
  onSave,
  onClose,
}: EditItemDialogProps) {
  const t = useTranslations('pipeline');

  return (
    <Dialog open={item !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('editItemTitle')}</DialogTitle>
          <DialogDescription>{t('editItemDescription')}</DialogDescription>
        </DialogHeader>

        {item && (
          <EditItemForm
            key={item.id}
            item={item}
            rows={rows}
            workers={workers}
            onSave={onSave}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type CustomKind = 'percentage' | 'fixed';

interface EditItemFormProps {
  item: PipelineItem;
  rows: PipelineRow[];
  workers: Worker[];
  onSave: (patch: Partial<PipelineItem>) => void;
  onClose: () => void;
}

function EditItemForm({ item, rows, workers, onSave, onClose }: EditItemFormProps) {
  const t = useTranslations('pipeline');
  const tCommon = useTranslations('common');

  // Form state initialized once per item (fresh mount per item.id via key prop)
  const [taxIndex, setTaxIndex] = useState<1 | 2>(
    item.type === 'tax' ? ((item.taxIndex ?? 1) as 1 | 2) : 1
  );
  const [workerId, setWorkerId] = useState<string>(
    item.type === 'salary' || item.type === 'worker_commission'
      ? item.workerId ?? ''
      : ''
  );
  const [customLabel, setCustomLabel] = useState(
    item.type === 'custom_deduction' ? item.label ?? '' : ''
  );
  const [customKind, setCustomKind] = useState<CustomKind>(
    item.type === 'custom_deduction' && item.fixedAmount !== undefined
      ? 'fixed'
      : 'percentage'
  );
  const [customRate, setCustomRate] = useState(
    item.type === 'custom_deduction' ? item.rate ?? 0 : 0
  );
  const [customAmount, setCustomAmount] = useState(
    item.type === 'custom_deduction' ? item.fixedAmount ?? 0 : 0
  );
  const [poolRate, setPoolRate] = useState(
    item.type === 'shared_pool_commission' ? item.poolRate ?? 0 : 0
  );
  const [participantIds, setParticipantIds] = useState<string[]>(
    item.type === 'shared_pool_commission' ? item.participantIds ?? [] : []
  );
  const [deductParticipantSalaries, setDeductParticipantSalaries] = useState(
    item.type === 'shared_pool_commission'
      ? item.deductParticipantSalaries ?? false
      : false
  );
  const [poolLabel, setPoolLabel] = useState(
    item.type === 'shared_pool_commission' ? item.label ?? '' : ''
  );

  // Constraint sets — "placed elsewhere" excludes the current item being edited
  const otherItems = rows.flatMap(r => r.items).filter(i => i.id !== item.id);
  const placedTaxes = new Set(
    otherItems.filter(i => i.type === 'tax').map(i => i.taxIndex)
  );
  const placedSalaries = new Set(
    otherItems.filter(i => i.type === 'salary').map(i => i.workerId)
  );
  const placedCommissions = new Set(
    otherItems.filter(i => i.type === 'worker_commission').map(i => i.workerId)
  );

  const handleSave = () => {
    let patch: Partial<PipelineItem> = {};

    if (item.type === 'tax') {
      patch = { taxIndex };
    } else if (item.type === 'salary' || item.type === 'worker_commission') {
      if (!workerId) return;
      patch = { workerId };
    } else if (item.type === 'custom_deduction') {
      if (!customLabel.trim()) return;
      patch = {
        label: customLabel.trim(),
        rate: customKind === 'percentage' ? customRate : undefined,
        fixedAmount: customKind === 'fixed' ? customAmount : undefined,
      };
    } else if (item.type === 'shared_pool_commission') {
      patch = {
        poolRate,
        participantIds,
        deductParticipantSalaries,
        label: poolLabel.trim() || undefined,
      };
    }

    onSave(patch);
  };

  return (
    <>
      <div className="space-y-4 py-2">
        {item.type === 'tax' && (
          <div className="space-y-1.5">
            <Label className="text-xs">{t('taxes')}</Label>
            <Select
              value={String(taxIndex)}
              onValueChange={(v) => setTaxIndex(Number(v) as 1 | 2)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {([1, 2] as const).map((idx) => {
                  const disabledByOther = placedTaxes.has(idx) && idx !== item.taxIndex;
                  return (
                    <SelectItem key={idx} value={String(idx)} disabled={disabledByOther}>
                      {t('tax', { index: idx })}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        )}

        {item.type === 'salary' && (
          <div className="space-y-1.5">
            <Label className="text-xs">{t('salaries')}</Label>
            <Select value={workerId} onValueChange={setWorkerId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {workers
                  .filter(w => (w.formula_config.salaryAmount ?? 0) > 0)
                  .map((w) => {
                    const disabledByOther = placedSalaries.has(w.id) && w.id !== item.workerId;
                    return (
                      <SelectItem key={w.id} value={w.id} disabled={disabledByOther}>
                        {t('salary', { name: w.name })}
                      </SelectItem>
                    );
                  })}
              </SelectContent>
            </Select>
          </div>
        )}

        {item.type === 'worker_commission' && (
          <div className="space-y-1.5">
            <Label className="text-xs">{t('commissions')}</Label>
            <Select value={workerId} onValueChange={setWorkerId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {workers.map((w) => {
                  const disabledByOther = placedCommissions.has(w.id) && w.id !== item.workerId;
                  const rate = w.formula_config.commissionRate ?? 0;
                  return (
                    <SelectItem key={w.id} value={w.id} disabled={disabledByOther}>
                      {t('workerCommission', { name: w.name, rate })}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        )}

        {item.type === 'shared_pool_commission' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('sharedPoolLabelField')}</Label>
              <Input
                value={poolLabel}
                onChange={(e) => setPoolLabel(e.target.value)}
                placeholder={t('sharedPoolLabelPlaceholder')}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('sharedPoolRate')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={poolRate || ''}
                  onChange={(e) => setPoolRate(parseFloat(e.target.value) || 0)}
                  className="h-9 text-sm"
                />
                <span className="text-muted-foreground text-sm">%</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('sharedPoolParticipants')}</Label>
              <div className="border rounded-md p-2 space-y-1.5 max-h-40 overflow-y-auto">
                {workers.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    {t('noWorkers')}
                  </p>
                ) : (
                  workers.map((w) => {
                    const checked = participantIds.includes(w.id);
                    return (
                      <label
                        key={w.id}
                        className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-1.5 py-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setParticipantIds(prev => [...prev, w.id]);
                            } else {
                              setParticipantIds(prev => prev.filter(id => id !== w.id));
                            }
                          }}
                          className="cursor-pointer"
                        />
                        <span>{w.name}</span>
                        {(w.formula_config.salaryAmount ?? 0) > 0 && (
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {w.formula_config.salaryPeriod === 'monthly'
                              ? `${w.formula_config.salaryAmount}/mo`
                              : `${w.formula_config.salaryAmount}/qtr`}
                          </span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={deductParticipantSalaries}
                onChange={(e) => setDeductParticipantSalaries(e.target.checked)}
                className="cursor-pointer mt-0.5"
              />
              <div className="flex flex-col">
                <span className="text-xs font-medium">
                  {t('sharedPoolDeductSalaries')}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {t('sharedPoolDeductSalariesHint')}
                </span>
              </div>
            </label>
          </>
        )}

        {item.type === 'custom_deduction' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('customLabel')}</Label>
              <Input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('customType')}</Label>
              <Select
                value={customKind}
                onValueChange={(v) => setCustomKind(v as CustomKind)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">{t('customPercentage')}</SelectItem>
                  <SelectItem value="fixed">{t('customFixed')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {customKind === 'percentage' ? (
              <div className="space-y-1.5">
                <Label className="text-xs">{t('customRate')}</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={customRate || ''}
                  onChange={(e) => setCustomRate(parseFloat(e.target.value) || 0)}
                  className="h-9 text-sm"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">{t('customAmount')}</Label>
                <Input
                  type="number"
                  min="0"
                  step="100"
                  value={customAmount || ''}
                  onChange={(e) => setCustomAmount(parseFloat(e.target.value) || 0)}
                  className="h-9 text-sm"
                />
              </div>
            )}
          </>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {tCommon('cancel')}
        </Button>
        <Button onClick={handleSave}>{t('saveChanges')}</Button>
      </DialogFooter>
    </>
  );
}
