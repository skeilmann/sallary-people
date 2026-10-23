'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatCurrency, formatCurrencyWhole } from '@/lib/formulas';
import type { MoneyFlow } from '@/lib/money-flow';

type SegmentKey = 'salaries' | 'bonuses' | 'costs' | 'keeps';

interface Segment {
  key: SegmentKey;
  label: string;
  amount: number;
  color: string;
}

function percentOf(part: number, whole: number): string {
  if (!(whole > 0)) return '0%';
  const pct = (part / whole) * 100;
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

function StatTile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'loss';
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3 min-w-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-xl font-semibold leading-tight whitespace-nowrap sm:text-2xl',
          tone === 'loss' && 'text-destructive',
        )}
      >
        {value}
      </p>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

/** Where the quarter's sales go: salaries, bonuses, taxes and expenses, and what is left. */
export function MoneyFlowCard({ flow }: { flow: MoneyFlow }) {
  const t = useTranslations('dashboard');
  const [active, setActive] = useState<SegmentKey | null>(null);

  const costs = flow.taxes + flow.expenses;
  const isLoss = flow.companyKeeps < 0;
  const segments: Segment[] = [
    { key: 'salaries' as const, label: t('flowSalaries'), amount: flow.salaries, color: 'var(--flow-salaries)' },
    { key: 'bonuses' as const, label: t('flowBonuses'), amount: flow.bonuses, color: 'var(--flow-bonuses)' },
    { key: 'costs' as const, label: t('flowCosts'), amount: costs, color: 'var(--flow-costs)' },
    { key: 'keeps' as const, label: t('flowKeeps'), amount: Math.max(0, flow.companyKeeps), color: 'var(--flow-keeps)' },
  ].filter((s) => s.amount > 0);

  // In a loss the costs are the whole bar; otherwise the sales are.
  const scale = Math.max(flow.companyRevenue, flow.salaries + flow.bonuses + costs);

  let offset = 0;
  const placed = segments.map((s) => {
    const width = (s.amount / scale) * 100;
    const left = offset;
    offset += width;
    return { ...s, width, center: left + width / 2 };
  });
  const activeSegment = placed.find((s) => s.key === active);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('flowTitle')}</CardTitle>
        <CardDescription>
          {t('flowSubtitle', { amount: formatCurrency(flow.companyRevenue) })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label={t('kpiSales')} value={formatCurrencyWhole(flow.companyRevenue)} />
          <StatTile label={t('kpiSalaries')} value={formatCurrencyWhole(flow.salaries)} note={t('kpiSalariesNote')} />
          <StatTile label={t('kpiBonuses')} value={formatCurrencyWhole(flow.bonuses)} />
          {isLoss ? (
            <StatTile label={t('kpiLoss')} value={formatCurrencyWhole(flow.companyKeeps)} tone="loss" />
          ) : (
            <StatTile label={t('kpiKeeps')} value={formatCurrencyWhole(flow.companyKeeps)} note={t('kpiKeepsNote')} />
          )}
        </div>

        <div>
          <div className="relative pt-7">
            {activeSegment && (
              <div
                role="tooltip"
                className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1 text-xs shadow-sm"
                style={{ left: `${Math.min(88, Math.max(12, activeSegment.center))}%` }}
              >
                <span className="font-semibold text-foreground">{formatCurrency(activeSegment.amount)}</span>
                <span className="ml-1.5 text-muted-foreground">
                  {activeSegment.label} · {percentOf(activeSegment.amount, flow.companyRevenue)}
                </span>
              </div>
            )}
            <div
              className="flex gap-[2px]"
              role="img"
              aria-label={t('flowChartLabel', {
                amount: formatCurrency(flow.companyRevenue),
                parts: placed.map((s) => `${s.label} ${formatCurrency(s.amount)}`).join(', '),
              })}
            >
              {placed.map((s, i) => (
                <div
                  key={s.key}
                  tabIndex={0}
                  aria-label={`${s.label}: ${formatCurrency(s.amount)}`}
                  className="py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  // Grow by amount so the segments and their 2px gaps fill the row exactly.
                  style={{ flexGrow: s.amount, flexBasis: 0, minWidth: 6 }}
                  onPointerEnter={() => setActive(s.key)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(s.key)}
                  onBlur={() => setActive(null)}
                >
                  <div
                    className={cn(
                      'h-5 transition-opacity',
                      i === placed.length - 1 && 'rounded-r',
                      active && active !== s.key && 'opacity-60',
                    )}
                    style={{ backgroundColor: s.color }}
                  />
                </div>
              ))}
            </div>
          </div>

          <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
            {placed.map((s) => (
              <li key={s.key} className="flex items-start gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className="mt-1 h-3 w-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: s.color }}
                />
                <span className="min-w-0">
                  <span className="block text-muted-foreground">{s.label}</span>
                  <span className="block font-medium tabular-nums">
                    {formatCurrency(s.amount)}
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      {percentOf(s.amount, flow.companyRevenue)}
                    </span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {isLoss && (
          <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t('flowLoss', { amount: formatCurrency(-flow.companyKeeps) })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
