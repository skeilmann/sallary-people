'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Worker, CalculationInputs, Quarter } from '@/lib/types';
import { getCurrentQuarter, getCurrentYear, generatePeriod } from '@/lib/types';
import {
  calculateBonus,
  calculateBonusWithGlobalInputs,
  getRequiredFields,
  formatCurrency,
  calculateFinalAmount,
  describeFormulaTranslated,
} from '@/lib/formulas';
import {
  usePersistedPeriod,
  usePersistedGlobalInputs,
  usePersistedIndividualRevenues,
  usePersistedSalaryOverrides,
} from '@/lib/usePersistedInputs';

interface DynamicBonusFormProps {
  workers: Worker[];
  initialWorkerId?: string;
  onSave: (data: {
    workerId: string;
    period: string;
    inputs: CalculationInputs;
    calculatedAmount: number;
    adjustmentAmount: number;
    adjustmentNote: string;
    finalAmount: number;
  }) => Promise<void>;
  onCancel: () => void;
}

const quarters: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];
const years = Array.from({ length: 5 }, (_, i) => getCurrentYear() - 2 + i);

export function DynamicBonusForm({
  workers,
  initialWorkerId,
  onSave,
  onCancel,
}: DynamicBonusFormProps) {
  const t = useTranslations('calculate');
  const tWorkers = useTranslations('workers');
  const tBonusCard = useTranslations('bonusCard');
  const tCommon = useTranslations('common');

  const [selectedWorkerId, setSelectedWorkerId] = useState(initialWorkerId || '');

  // Shared period (same as Dashboard)
  const { quarter, year, setQuarter, setYear } = usePersistedPeriod(
    getCurrentQuarter(),
    getCurrentYear(),
  );

  // Shared period-scoped inputs
  const { globalInputs, setGlobalInputs } = usePersistedGlobalInputs(quarter, year);
  const { individualRevenues, setIndividualRevenues } = usePersistedIndividualRevenues(quarter, year);
  const { salaryOverrides, setSalaryOverrides } = usePersistedSalaryOverrides(quarter, year);

  const [inputs, setInputs] = useState<CalculationInputs>({ baseValue: 0 });
  const [adjustmentPercent, setAdjustmentPercent] = useState(0);
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedWorker = useMemo(
    () => workers.find((w) => w.id === selectedWorkerId),
    [workers, selectedWorkerId]
  );

  const requiredFields = useMemo(
    () => (selectedWorker ? getRequiredFields(selectedWorker.formula_config) : []),
    [selectedWorker]
  );

  // Whether this worker's bonus is revenue-driven (matches Dashboard's calc path).
  const isRevenueMetric = selectedWorker?.formula_config.baseMetric === 'revenue';
  const isIndividualRevenue = selectedWorker?.formula_config.revenueSource === 'individual';
  const hasSalaryDeduction = !!selectedWorker?.formula_config.deductSalary;

  // Seed form values from shared persisted state when worker or period changes.
  useEffect(() => {
    if (!selectedWorker) {
      setInputs({ baseValue: 0 });
      setAdjustmentPercent(0);
      setAdjustmentNote('');
      return;
    }
    const newInputs: CalculationInputs = { baseValue: 0 };

    if (isRevenueMetric) {
      if (isIndividualRevenue) {
        const value = individualRevenues[selectedWorker.id] ?? 0;
        newInputs.baseValue = value;
        newInputs.individualRevenue = value;
      } else {
        newInputs.baseValue = globalInputs.totalRevenue;
      }
    }

    if (hasSalaryDeduction) {
      newInputs.salary =
        salaryOverrides[selectedWorker.id] ?? selectedWorker.formula_config.salaryAmount ?? 0;
    }

    for (const field of requiredFields) {
      if (field !== 'baseValue' && !(field in newInputs)) {
        (newInputs as unknown as Record<string, number>)[field] = 0;
      }
    }

    setInputs(newInputs);
    setAdjustmentPercent(0);
    setAdjustmentNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedWorkerId,
    quarter,
    year,
    requiredFields,
    isRevenueMetric,
    isIndividualRevenue,
    hasSalaryDeduction,
  ]);

  const calculatedAmount = useMemo(() => {
    if (!selectedWorker) return 0;
    const config = selectedWorker.formula_config;
    // Use the Dashboard calculation path for revenue-based workers so totals match
    // (applies salary and tax deductions consistently).
    if (config.baseMetric === 'revenue') {
      const effectiveGlobalInputs =
        config.revenueSource === 'individual'
          ? globalInputs
          : { ...globalInputs, totalRevenue: inputs.baseValue || 0 };
      return calculateBonusWithGlobalInputs(config, effectiveGlobalInputs, {
        salary: inputs.salary,
        individualRevenue:
          config.revenueSource === 'individual' ? inputs.baseValue || 0 : undefined,
      });
    }
    return calculateBonus(config, inputs);
  }, [selectedWorker, inputs, globalInputs]);

  const adjustmentAmount = useMemo(() => {
    return Math.round(calculatedAmount * (adjustmentPercent / 100) * 100) / 100;
  }, [calculatedAmount, adjustmentPercent]);

  const finalAmount = useMemo(() => {
    return calculateFinalAmount(calculatedAmount, adjustmentAmount);
  }, [calculatedAmount, adjustmentAmount]);

  const handleInputChange = (field: string, value: number) => {
    setInputs((prev) => ({ ...prev, [field]: value }));

    // Write shared fields back to the persisted period-scoped maps so other pages see them.
    if (!selectedWorker) return;

    if (field === 'baseValue' && isRevenueMetric) {
      if (isIndividualRevenue) {
        setIndividualRevenues((prev) => ({ ...prev, [selectedWorker.id]: value }));
        setInputs((prev) => ({ ...prev, individualRevenue: value }));
      } else {
        setGlobalInputs((prev) => ({ ...prev, totalRevenue: value }));
      }
    }

    if (field === 'salary') {
      setSalaryOverrides((prev) => ({ ...prev, [selectedWorker.id]: value }));
    }
  };

  const getFieldLabel = (field: string): string => {
    if (field === 'baseValue' && selectedWorker) {
      return t(`fields.${selectedWorker.formula_config.baseMetric}`);
    }
    return t(`fields.${field}`);
  };

  const handleSave = async () => {
    if (!selectedWorker) return;
    if (adjustmentPercent !== 0 && !adjustmentNote.trim()) {
      alert(t('step3.justificationNote'));
      return;
    }

    setSaving(true);
    try {
      await onSave({
        workerId: selectedWorkerId,
        period: generatePeriod(quarter as Quarter, year),
        inputs,
        calculatedAmount,
        adjustmentAmount,
        adjustmentNote: adjustmentNote.trim(),
        finalAmount,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Step 1: Select Worker & Period */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('step1.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>{t('step1.worker')}</Label>
              <Select value={selectedWorkerId} onValueChange={setSelectedWorkerId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('step1.selectWorker')} />
                </SelectTrigger>
                <SelectContent>
                  {workers.map((worker) => (
                    <SelectItem key={worker.id} value={worker.id}>
                      {worker.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('step1.quarter')}</Label>
              <Select value={quarter} onValueChange={(v) => setQuarter(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {quarters.map((q) => (
                    <SelectItem key={q} value={q}>
                      {q}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('step1.year')}</Label>
              <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={y.toString()}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedWorker && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium">{t('step1.formula')}</p>
              <p className="text-sm text-muted-foreground">
                {describeFormulaTranslated(selectedWorker.formula_config, tWorkers)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Enter Metrics */}
      {selectedWorker && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('step2.title')}</CardTitle>
            <CardDescription>
              {t('step2.subtitle', { name: selectedWorker.name })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {requiredFields.map((field) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={field}>
                  {getFieldLabel(field)}
                </Label>
                <Input
                  id={field}
                  type="number"
                  min="0"
                  step="0.01"
                  value={inputs[field as keyof CalculationInputs] || 0}
                  onChange={(e) =>
                    handleInputChange(field, parseFloat(e.target.value) || 0)
                  }
                  className="max-w-xs"
                />
              </div>
            ))}

            {hasSalaryDeduction && (
              <div className="space-y-2">
                <Label htmlFor="salary">{tBonusCard('salaryToDeduct')}</Label>
                <Input
                  id="salary"
                  type="number"
                  min="0"
                  step="100"
                  value={inputs.salary ?? 0}
                  onChange={(e) =>
                    handleInputChange('salary', parseFloat(e.target.value) || 0)
                  }
                  className="max-w-xs"
                />
              </div>
            )}

            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground">{t('step2.calculatedBonus')}</p>
              <p className="text-2xl font-bold">{formatCurrency(calculatedAmount)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Adjustment */}
      {selectedWorker && calculatedAmount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('step3.title')}</CardTitle>
            <CardDescription>
              {t('step3.subtitle')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>{t('step3.adjustment', { value: adjustmentPercent > 0 ? `+${adjustmentPercent}` : adjustmentPercent })}</Label>
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

            {adjustmentPercent !== 0 && (
              <div className="space-y-2">
                <Label htmlFor="note">{t('step3.justificationNote')}</Label>
                <Textarea
                  id="note"
                  value={adjustmentNote}
                  onChange={(e) => setAdjustmentNote(e.target.value)}
                  placeholder={t('step3.justificationPlaceholder')}
                  rows={2}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Review & Save */}
      {selectedWorker && calculatedAmount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('step4.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg mb-4">
              <div>
                <p className="text-sm text-muted-foreground">{t('step4.finalBonusAmount')}</p>
                <p className="text-3xl font-bold">{formatCurrency(finalAmount)}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedWorker.name} • {generatePeriod(quarter as Quarter, year)}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? tCommon('loading') : t('step4.saveCalculation')}
              </Button>
              <Button variant="outline" onClick={onCancel}>
                {tCommon('cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
