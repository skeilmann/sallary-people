'use client';

import { useEffect, useState, useMemo } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalculationHistory } from '@/components/CalculationHistory';
import { ComparisonView } from '@/components/ComparisonView';
import { TabHeader } from '@/components/TabHeader';
import { tabStyleVars } from '@/lib/tab-themes';
import type { Worker, CalculationWithWorker, Quarter } from '@/lib/types';
import { getCurrentQuarter, getCurrentYear, generatePeriod } from '@/lib/types';
import { getWorkers, getCalculations, deleteCalculation } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formulas';

const quarters: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];
const years = Array.from({ length: 5 }, (_, i) => getCurrentYear() - 2 + i);

function HistoryPageContent() {
  const t = useTranslations('history');
  const tCommon = useTranslations('common');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [calculations, setCalculations] = useState<CalculationWithWorker[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterWorkerId, setFilterWorkerId] = useState<string>('all');
  const [filterQuarter, setFilterQuarter] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>(getCurrentYear().toString());

  // Comparison
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [workersData, calculationsData] = await Promise.all([
        getWorkers(),
        getCalculations(),
      ]);
      setWorkers(workersData);
      setCalculations(calculationsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCalculations = useMemo(() => {
    return calculations.filter((calc) => {
      if (filterWorkerId !== 'all' && calc.worker_id !== filterWorkerId) {
        return false;
      }
      if (filterQuarter !== 'all' || filterYear !== 'all') {
        const periodParts = calc.period.split(' ');
        const calcQuarter = periodParts[0];
        const calcYear = periodParts[1];

        if (filterQuarter !== 'all' && calcQuarter !== filterQuarter) {
          return false;
        }
        if (filterYear !== 'all' && calcYear !== filterYear) {
          return false;
        }
      }
      return true;
    });
  }, [calculations, filterWorkerId, filterQuarter, filterYear]);

  const selectedCalculations = useMemo(() => {
    return calculations.filter((c) => selectedIds.includes(c.id));
  }, [calculations, selectedIds]);

  const totalAmount = useMemo(() => {
    return filteredCalculations.reduce((sum, c) => sum + c.final_amount, 0);
  }, [filteredCalculations]);

  const handleDelete = async (id: string) => {
    await deleteCalculation(id);
    setCalculations((prev) => prev.filter((c) => c.id !== id));
    setSelectedIds((prev) => prev.filter((i) => i !== id));
  };

  const exportToCSV = () => {
    const headers = [
      'Worker',
      'Period',
      'Calculated Amount',
      'Adjustment',
      'Final Amount',
      'Adjustment Note',
      'Date',
    ];
    const rows = filteredCalculations.map((c) => [
      c.worker?.name || '',
      c.period,
      c.calculated_amount,
      c.adjustment_amount,
      c.final_amount,
      c.adjustment_note || '',
      new Date(c.created_at).toISOString(),
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bonus-calculations-${filterYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <>
        <TabHeader tab="history" />
        <div className="container mx-auto p-6">
          <div className="text-center py-12 text-muted-foreground">{tCommon('loading')}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <TabHeader
        tab="history"
        actions={
          <>
            <Button
              variant={compareMode ? 'default' : 'outline'}
              onClick={() => {
                setCompareMode(!compareMode);
                if (compareMode) setSelectedIds([]);
              }}
            >
              {compareMode ? t('exitCompare') : tCommon('compare')}
            </Button>
            <Button variant="outline" onClick={exportToCSV}>
              {t('exportCSV')}
            </Button>
          </>
        }
      />
      <div className="container mx-auto p-6">
      <p className="mb-6 text-sm text-muted-foreground">
        {t('summary', { count: filteredCalculations.length, total: formatCurrency(totalAmount) })}
      </p>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6 p-4 bg-muted rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('filters.worker')}</span>
          <Select value={filterWorkerId} onValueChange={setFilterWorkerId}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allWorkers')}</SelectItem>
              {workers.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('filters.quarter')}</span>
          <Select value={filterQuarter} onValueChange={setFilterQuarter}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tCommon('all')}</SelectItem>
              {quarters.map((q) => (
                <SelectItem key={q} value={q}>
                  {q}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('filters.year')}</span>
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tCommon('all')}</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {(filterWorkerId !== 'all' || filterQuarter !== 'all' || filterYear !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterWorkerId('all');
              setFilterQuarter('all');
              setFilterYear('all');
            }}
          >
            {t('filters.clearFilters')}
          </Button>
        )}
      </div>

      {compareMode ? (
        <Tabs defaultValue="select" className="space-y-4" style={tabStyleVars('history')}>
          <TabsList variant="accent">
            <TabsTrigger value="select">
              {t('compare.select', { count: selectedIds.length })}
            </TabsTrigger>
            <TabsTrigger value="compare" disabled={selectedIds.length < 2}>
              {t('compare.compareTab')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="select">
            <p className="text-sm text-muted-foreground mb-4">
              {t('compare.selectPrompt')}
            </p>
            <CalculationHistory
              calculations={filteredCalculations}
              selectable
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
            />
          </TabsContent>

          <TabsContent value="compare">
            <ComparisonView calculations={selectedCalculations} />
          </TabsContent>
        </Tabs>
      ) : (
        <CalculationHistory
          calculations={filteredCalculations}
          onDelete={handleDelete}
        />
      )}
      </div>
    </>
  );
}

export default function HistoryPage() {
  return (
    <RequireAuth>
      <HistoryPageContent />
    </RequireAuth>
  );
}
