'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Quarter, Worker } from '@/lib/types';
import { formatCurrency } from '@/lib/formulas';

const quarters: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];

interface QuarterInputsCardProps {
  quarter: Quarter;
  year: number;
  years: number[];
  onQuarterChange: (q: Quarter) => void;
  onYearChange: (y: number) => void;
  sellers: Worker[];
  sales: Record<string, number>;
  onSaleChange: (workerId: string, value: number) => void;
  typedCompanyRevenue: number | undefined;
  sellersTotal: number;
  onCompanyRevenueChange: (value: number | undefined) => void;
  /** Tax rates are only asked for when the pipeline has tax steps. */
  showTaxRates: boolean;
  taxRate1: number;
  taxRate2: number;
  onTaxRateChange: (index: 1 | 2, value: number) => void;
}

function AmountEcho({ value }: { value: number }) {
  if (!(value > 0)) return null;
  return <p className="text-xs text-muted-foreground tabular-nums">{formatCurrency(value)}</p>;
}

export function QuarterInputsCard({
  quarter,
  year,
  years,
  onQuarterChange,
  onYearChange,
  sellers,
  sales,
  onSaleChange,
  typedCompanyRevenue,
  sellersTotal,
  onCompanyRevenueChange,
  showTaxRates,
  taxRate1,
  taxRate2,
  onTaxRateChange,
}: QuarterInputsCardProps) {
  const t = useTranslations('dashboard');

  return (
    <Card accent="dashboard">
      <CardHeader>
        <CardTitle>{t('salesTitle')}</CardTitle>
        <CardDescription>{t('salesHint')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>{t('period')}</Label>
            <div className="flex gap-2">
              <Select value={quarter} onValueChange={(v) => onQuarterChange(v as Quarter)}>
                <SelectTrigger className="w-24" aria-label={t('period')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {quarters.map((q) => (
                    <SelectItem key={q} value={q}>{q}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={year.toString()} onValueChange={(v) => onYearChange(parseInt(v))}>
                <SelectTrigger className="w-24" aria-label={t('year')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {sellers.map((seller) => (
            <div key={seller.id} className="space-y-2">
              <Label htmlFor={`sales-${seller.id}`}>{t('soldBy', { name: seller.name })}</Label>
              <Input
                id={`sales-${seller.id}`}
                type="number"
                inputMode="decimal"
                min="0"
                step="1000"
                value={sales[seller.id] || ''}
                onChange={(e) => onSaleChange(seller.id, parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
              <AmountEcho value={sales[seller.id] ?? 0} />
            </div>
          ))}

          <div className="space-y-2">
            <Label htmlFor="company-sales">{t('companySales')}</Label>
            <Input
              id="company-sales"
              type="number"
              inputMode="decimal"
              min="0"
              step="1000"
              value={typedCompanyRevenue || ''}
              onChange={(e) => onCompanyRevenueChange(parseFloat(e.target.value) || undefined)}
              placeholder={sellersTotal > 0 ? String(sellersTotal) : '0'}
            />
            {typedCompanyRevenue ? (
              <AmountEcho value={typedCompanyRevenue} />
            ) : (
              <p className="text-xs text-muted-foreground">
                {t('companySalesAuto', { amount: formatCurrency(sellersTotal) })}
              </p>
            )}
          </div>
        </div>

        {sellers.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('noSellers')}</p>
        )}

        {showTaxRates && (
          <div className="grid gap-x-6 gap-y-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
            {([1, 2] as const).map((index) => (
              <div key={index} className="space-y-2">
                <Label htmlFor={`tax-${index}`}>{t(index === 1 ? 'taxRate1' : 'taxRate2')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`tax-${index}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.1"
                    value={(index === 1 ? taxRate1 : taxRate2) || ''}
                    onChange={(e) => onTaxRateChange(index, parseFloat(e.target.value) || 0)}
                    placeholder="0"
                  />
                  <span className="text-muted-foreground">%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
