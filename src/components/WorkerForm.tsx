'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { Worker, FormulaConfig } from '@/lib/types';
import { defaultFormulaConfig } from '@/lib/types';

interface WorkerFormProps {
  worker?: Worker;
  open: boolean;
  onClose: () => void;
  onSave: (data: { name: string; formula_config: FormulaConfig }) => Promise<void>;
}

const METRICS: FormulaConfig['baseMetric'][] = ['revenue', 'units_sold', 'profit_margin'];
const DEDUCTIONS: FormulaConfig['deductions'][number][] = ['returns', 'chargebacks', 'discounts'];

// Feature flag: when false, the "Deductions (subtract from base)" buttons
// (Returns / Chargebacks / Discounts) are hidden from the form and any
// existing `deductions` values on a worker are reset on save.
// Flip to true to restore the buttons.
const SHOW_DEDUCTION_BUTTONS = false;

export function WorkerForm({ worker, open, onClose, onSave }: WorkerFormProps) {
  const t = useTranslations('workers');
  const tCommon = useTranslations('common');

  const [name, setName] = useState(worker?.name || '');
  const [config, setConfig] = useState<FormulaConfig>(
    worker?.formula_config || defaultFormulaConfig
  );
  const [saving, setSaving] = useState(false);

  // Reset form when worker changes or dialog opens
  useEffect(() => {
    if (open) {
      setName(worker?.name || '');
      setConfig(worker?.formula_config || defaultFormulaConfig);
    }
  }, [open, worker]);

  const handleSave = async () => {
    if (!name.trim()) return;

    const configToSave: FormulaConfig = SHOW_DEDUCTION_BUTTONS
      ? config
      : { ...config, deductions: [] };

    setSaving(true);
    try {
      await onSave({ name: name.trim(), formula_config: configToSave });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const toggleDeduction = (deduction: FormulaConfig['deductions'][number]) => {
    setConfig((prev) => ({
      ...prev,
      deductions: prev.deductions.includes(deduction)
        ? prev.deductions.filter((d) => d !== deduction)
        : [...prev.deductions, deduction],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {worker ? t('editWorker') : t('addWorker').replace('+ ', '')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">{t('form.name')}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('form.namePlaceholder')}
            />
          </div>

          {/* Base Metric */}
          <div className="space-y-2">
            <Label>{t('form.baseMetric')}</Label>
            <Select
              value={config.baseMetric}
              onValueChange={(value) =>
                setConfig((prev) => ({
                  ...prev,
                  baseMetric: value as FormulaConfig['baseMetric'],
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRICS.map((metric) => (
                  <SelectItem key={metric} value={metric}>
                    {t(`metrics.${metric}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Commission Rate */}
          <div className="space-y-2">
            <Label htmlFor="commission">{t('form.commissionRate')}</Label>
            <Input
              id="commission"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={config.commissionRate}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  commissionRate: parseFloat(e.target.value) || 0,
                }))
              }
            />
          </div>

          {/* Revenue Source */}
          <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
            <Label>{t('form.revenueSource')}</Label>
            <Select
              value={config.revenueSource || 'global'}
              onValueChange={(value) =>
                setConfig((prev) => ({
                  ...prev,
                  revenueSource: value as 'global' | 'individual',
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">
                  {t('form.revenueSourceGlobal')}
                </SelectItem>
                <SelectItem value="individual">
                  {t('form.revenueSourceIndividual')}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('form.revenueSourceHelp')}
            </p>
          </div>

          {/* Deductions */}
          {SHOW_DEDUCTION_BUTTONS && (
            <div className="space-y-2">
              <Label>{t('form.deductions')}</Label>
              <div className="flex flex-wrap gap-2">
                {DEDUCTIONS.map((deduction) => (
                  <Button
                    key={deduction}
                    type="button"
                    variant={config.deductions.includes(deduction) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleDeduction(deduction)}
                  >
                    {t(`deductionLabels.${deduction}`)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Salary Deduction */}
          <div className="space-y-2 p-3 border rounded-lg">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="deductSalary"
                checked={config.deductSalary || false}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    deductSalary: e.target.checked,
                  }))
                }
                className="rounded"
              />
              <Label htmlFor="deductSalary">{t('form.deductSalary')}</Label>
            </div>
            {(config.revenueSource ?? 'global') === 'global' && (
              <p className="text-xs text-muted-foreground ml-6">
                {t('form.deductSalaryPipelineNote')}
              </p>
            )}
            {config.deductSalary && (
              <div className="ml-6 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="salaryAmount">{t('form.defaultSalary')}</Label>
                  <Input
                    id="salaryAmount"
                    type="number"
                    min="0"
                    step="100"
                    value={config.salaryAmount || 0}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        salaryAmount: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salaryPeriod">{t('form.salaryPeriod')}</Label>
                  <Select
                    value={config.salaryPeriod ?? 'quarterly'}
                    onValueChange={(value) =>
                      setConfig((prev) => ({
                        ...prev,
                        salaryPeriod: value as 'monthly' | 'quarterly',
                      }))
                    }
                  >
                    <SelectTrigger id="salaryPeriod">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quarterly">
                        {t('form.salaryPeriodQuarterly')}
                      </SelectItem>
                      <SelectItem value="monthly">
                        {t('form.salaryPeriodMonthly')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t('form.salaryPeriodHelp')}
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? t('form.saving') : worker ? t('form.saveChanges') : tCommon('add') + ' ' + t('title').toLowerCase().slice(0, -1)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
