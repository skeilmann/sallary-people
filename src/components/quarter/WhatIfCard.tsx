'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/formulas';
import { whatIfAmount, type PersonPay, type WhatIfBonus } from '@/lib/money-flow';

interface WhatIfCardProps {
  /** People with no bonus rule in the pipeline (salary only). */
  people: PersonPay[];
  whatIf: Record<string, WhatIfBonus>;
  onChange: (workerId: string, value: WhatIfBonus) => void;
  companyRevenue: number;
  companyKeepsNow: number;
  companyKeepsWithAll: number;
}

const EMPTY_WHAT_IF: WhatIfBonus = { mode: 'percent', value: 0, pay: false };

/** Try a bonus for people paid salary only, and see what it would cost. */
export function WhatIfCard({
  people,
  whatIf,
  onChange,
  companyRevenue,
  companyKeepsNow,
  companyKeepsWithAll,
}: WhatIfCardProps) {
  const t = useTranslations('dashboard');

  if (people.length === 0) return null;

  const tried = people.some((p) => whatIfAmount(whatIf[p.workerId], companyRevenue) > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('whatIfTitle')}</CardTitle>
        <CardDescription>{t('whatIfSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y">
          {people.map((p) => {
            const current = whatIf[p.workerId] ?? EMPTY_WHAT_IF;
            const amount = whatIfAmount(current, companyRevenue);
            const update = (patch: Partial<WhatIfBonus>) => onChange(p.workerId, { ...current, ...patch });
            return (
              <li key={p.workerId} className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[minmax(8rem,1fr)_auto_minmax(12rem,1fr)] md:items-center">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {t('whatIfSalary', { amount: formatCurrency(p.quarterSalary) })}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Label htmlFor={`whatif-${p.workerId}`} className="sr-only">
                    {t('whatIfAmount', { name: p.name })}
                  </Label>
                  <Input
                    id={`whatif-${p.workerId}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step={current.mode === 'percent' ? '0.5' : '100'}
                    value={current.value || ''}
                    onChange={(e) => update({ value: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-28"
                  />
                  <Select
                    value={current.mode}
                    // A new unit starts empty: 500 € must not become 500%.
                    onValueChange={(v) => update({ mode: v as WhatIfBonus['mode'], value: 0, pay: false })}
                  >
                    <SelectTrigger className="w-auto min-w-44" aria-label={t('whatIfUnit')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">{t('whatIfModePercent')}</SelectItem>
                      <SelectItem value="fixed">{t('whatIfModeFixed')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <p className="text-sm tabular-nums">
                    {amount > 0
                      ? t('whatIfResult', {
                          bonus: formatCurrency(amount),
                          total: formatCurrency(p.quarterSalary + amount),
                        })
                      : <span className="text-muted-foreground">{t('whatIfEmpty')}</span>}
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={current.pay}
                      disabled={amount === 0}
                      onCheckedChange={(checked) => update({ pay: checked === true })}
                    />
                    {t('whatIfPay')}
                  </label>
                </div>
              </li>
            );
          })}
        </ul>

        {tried && companyKeepsWithAll !== companyKeepsNow && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            {t('whatIfSummary', {
              after: formatCurrency(companyKeepsWithAll),
              before: formatCurrency(companyKeepsNow),
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
