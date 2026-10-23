'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formulas';
import type { ExplainedStep } from '@/lib/money-flow';

type Translate = ReturnType<typeof useTranslations>;

interface DescribedStep {
  title: string;
  amount: string;
  tone: 'bonus' | 'cost';
  details: string[];
  warning?: string;
}

function describeStep(step: ExplainedStep, t: Translate): DescribedStep {
  switch (step.kind) {
    case 'pool': {
      const names = step.participants.map((p) => p.name).join(' + ');
      const details = [
        step.baseSource === 'participants_sum'
          ? t('poolGross', { rate: step.rate, base: formatCurrency(step.base), names, gross: formatCurrency(step.gross) })
          : t('poolGrossPipeline', {
              rate: step.rate, base: formatCurrency(step.base), step: step.stepIndex + 1, gross: formatCurrency(step.gross),
            }),
      ];
      if (step.deductsSalaries) {
        details.push(t('poolSalaries', {
          amount: formatCurrency(step.salaries),
          details: step.participants.map((p) => `${p.name} ${formatCurrency(p.quarterSalary)}`).join(' + '),
        }));
      }
      const notCovered = step.deductsSalaries && step.gross < step.salaries;
      if (!notCovered && step.participants.length > 0) {
        details.push(t('poolSplit', {
          net: formatCurrency(step.net), count: step.participants.length, each: formatCurrency(step.perPerson),
        }));
      }
      return {
        title: step.label ? `${step.label} (${names})` : t('poolTitle', { names }),
        amount: t('poolEach', { amount: formatCurrency(step.perPerson) }),
        tone: 'bonus',
        details,
        warning: notCovered
          ? t('poolNotCovered', { gross: formatCurrency(step.gross), salaries: formatCurrency(step.salaries) })
          : undefined,
      };
    }
    case 'commission': {
      const values = { rate: step.rate, base: formatCurrency(step.base), amount: formatCurrency(step.gross) };
      const formula = {
        own_sales: () => t('commissionOwnSales', values),
        own_sales_reduced: () => t('commissionOwnSalesReduced', values),
        company_revenue: () => t('commissionCompany', values),
        running_total: () => t('commissionRunningTotal', { ...values, step: step.stepIndex + 1 }),
      }[step.basis]();
      return { title: step.name, amount: formatCurrency(step.gross), tone: 'bonus', details: [formula] };
    }
    case 'tax':
      return {
        title: t('taxTitle', { index: step.taxIndex }),
        amount: `−${formatCurrency(step.amount)}`,
        tone: 'cost',
        details: [t('tax', { rate: step.rate, base: formatCurrency(step.base), amount: formatCurrency(step.amount) })],
      };
    case 'expense':
      return {
        title: step.label,
        amount: `−${formatCurrency(step.amount)}`,
        tone: 'cost',
        details: step.rate !== undefined
          ? [t('expensePercent', { rate: step.rate, base: formatCurrency(step.base), amount: formatCurrency(step.amount) })]
          : [],
      };
    case 'salary': {
      const details: string[] = [];
      if (step.fromBonus > 0) details.push(t('salaryFromBonus', { amount: formatCurrency(step.fromBonus) }));
      if (step.cost > 0) details.push(t('salaryCost', { amount: formatCurrency(step.cost) }));
      return {
        title: t('salaryTitle', { name: step.name }),
        amount: `−${formatCurrency(step.fromBonus + step.cost)}`,
        tone: 'cost',
        details,
      };
    }
  }
}

/** The calculation written out step by step, one entry per pipeline card. */
export function StepExplanationList({
  steps,
  className,
}: {
  steps: ExplainedStep[];
  className?: string;
}) {
  const t = useTranslations('explain');

  return (
    <ol className={cn('divide-y', className)}>
      {steps.map((step) => {
        const described = describeStep(step, t);
        return (
          <li key={step.itemId} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium min-w-0">{described.title}</span>
              <span
                className={cn(
                  'tabular-nums shrink-0',
                  described.tone === 'bonus' ? 'font-semibold' : 'text-muted-foreground',
                )}
              >
                {described.amount}
              </span>
            </div>
            {described.details.map((line) => (
              <p key={line} className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                {line}
              </p>
            ))}
            {described.warning && (
              <p className="mt-1 text-sm text-amber-800 bg-amber-50 rounded px-2 py-1">
                {described.warning}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
