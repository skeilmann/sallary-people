'use client';

import { useTranslations, useLocale } from 'next-intl';
import { CheckCircle2, Loader2, AlertCircle, CircleDot } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/formulas';
import type { ExplainedStep, MoneyFlow, PersonPay } from '@/lib/money-flow';

type Translate = ReturnType<typeof useTranslations>;

/** A short name for how this person's bonus is decided. */
function describeRule(person: PersonPay, steps: ExplainedStep[], t: Translate): string {
  const parts: string[] = [];
  for (const step of steps) {
    if (step.kind === 'pool' && step.participants.some((p) => p.id === person.workerId)) {
      parts.push(step.label || t('ruleTeamPool', { rate: step.rate }));
    } else if (step.kind === 'commission' && step.workerId === person.workerId) {
      parts.push(
        step.basis === 'own_sales' || step.basis === 'own_sales_reduced'
          ? t('ruleOwnSales', { rate: step.rate })
          : step.basis === 'company_revenue'
            ? t('ruleCompanySales', { rate: step.rate })
            : t('ruleRunningTotal', { rate: step.rate }),
      );
    }
  }
  if (person.extraBonus > 0) parts.push(t('ruleExtra'));
  return parts.length > 0 ? parts.join(' + ') : t('ruleSalaryOnly');
}

interface PeopleTableCardProps {
  flow: MoneyFlow;
  steps: ExplainedStep[];
  period: string;
  saving: boolean;
  saveFailedCount: number;
  unsaved: boolean;
  lastSavedAt: string | null;
  canSave: boolean;
  onSave: () => void;
}

export function PeopleTableCard({
  flow,
  steps,
  period,
  saving,
  saveFailedCount,
  unsaved,
  lastSavedAt,
  canSave,
  onSave,
}: PeopleTableCardProps) {
  const t = useTranslations('dashboard');
  const locale = useLocale();

  // People with a bonus first, in the workers' order; then salary only.
  const people = [...flow.people].sort(
    (a, b) => Number(b.bonusToPay > 0 || b.hasRule) - Number(a.bonusToPay > 0 || a.hasRule),
  );
  const total = people.reduce(
    (acc, p) => ({
      salary: acc.salary + p.quarterSalary,
      bonus: acc.bonus + p.bonusToPay,
      pay: acc.pay + p.totalPay,
    }),
    { salary: 0, bonus: 0, pay: 0 },
  );

  const savedDate = lastSavedAt
    ? new Date(lastSavedAt).toLocaleString(locale, {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('peopleTitle')}</CardTitle>
        <CardDescription>{t('peopleSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-medium">{t('colPerson')}</th>
              <th scope="col" className="hidden py-2 px-3 text-right font-medium sm:table-cell">{t('colSalary')}</th>
              <th scope="col" className="hidden py-2 px-3 text-right font-medium sm:table-cell">{t('colBonus')}</th>
              <th scope="col" className="py-2 pl-3 text-right font-medium">{t('colTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.workerId} className="border-b last:border-b-0 align-top">
                <td className="py-2.5 pr-3">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{describeRule(p, steps, t)}</p>
                  <p className="text-xs text-muted-foreground tabular-nums sm:hidden">
                    {t('salaryPlusBonus', {
                      salary: formatCurrency(p.quarterSalary),
                      bonus: formatCurrency(p.bonusToPay),
                    })}
                  </p>
                  {p.adjustment !== 0 && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {t('includesAdjustment', {
                        amount: `${p.adjustment > 0 ? '+' : '−'}${formatCurrency(Math.abs(p.adjustment))}`,
                      })}
                    </p>
                  )}
                </td>
                <td className="hidden py-2.5 px-3 text-right tabular-nums sm:table-cell">
                  {formatCurrency(p.quarterSalary)}
                </td>
                <td className="hidden py-2.5 px-3 text-right tabular-nums sm:table-cell">
                  {p.bonusToPay > 0 ? formatCurrency(p.bonusToPay) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="py-2.5 pl-3 text-right font-semibold tabular-nums">
                  {formatCurrency(p.totalPay)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold">
              <td className="py-2.5 pr-3">{t('rowTotal')}</td>
              <td className="hidden py-2.5 px-3 text-right tabular-nums sm:table-cell">{formatCurrency(total.salary)}</td>
              <td className="hidden py-2.5 px-3 text-right tabular-nums sm:table-cell">{formatCurrency(total.bonus)}</td>
              <td className="py-2.5 pl-3 text-right tabular-nums">{formatCurrency(total.pay)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm" aria-live="polite">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                <span className="text-muted-foreground">{t('saving')}</span>
              </>
            ) : !canSave ? (
              <span className="text-muted-foreground">{t('nothingToSave')}</span>
            ) : saveFailedCount > 0 ? (
              <>
                <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
                <span className="text-destructive">{t('saveSomeFailed', { count: saveFailedCount })}</span>
              </>
            ) : unsaved ? (
              <>
                <CircleDot className="h-4 w-4 text-amber-600" aria-hidden="true" />
                <span>{savedDate ? t('changedSinceSave', { date: savedDate }) : t('notSavedYet')}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
                <span>{t('savedAt', { date: savedDate ?? '' })}</span>
              </>
            )}
          </div>
          {/* Saving unchanged numbers again would only add duplicate versions. */}
          <Button onClick={onSave} disabled={saving || !canSave || !unsaved} className="sm:min-w-40">
            {t('saveQuarter', { period })}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
