'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { WorkerCard } from '@/components/WorkerCard';
import { WorkerForm } from '@/components/WorkerForm';
import { WorkerHistoryCard } from '@/components/WorkerHistoryCard';
import { TabHeader } from '@/components/TabHeader';
import type { Worker, FormulaConfig } from '@/lib/types';
import { getWorkers, createWorker, updateWorker, deleteWorker } from '@/lib/supabase';

const MAX_COMPARE_SELECTIONS = 3;

function WorkersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('workers');
  const tHistory = useTranslations('workerHistory');
  const tCommon = useTranslations('common');

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | undefined>();

  // Track selected calculations for comparison
  const [selectedCalculationIds, setSelectedCalculationIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadWorkers();
    // Load any previously selected calculations from localStorage
    const stored = localStorage.getItem('compareCalculationIds');
    if (stored) {
      try {
        const ids = JSON.parse(stored);
        setSelectedCalculationIds(new Set(ids));
      } catch {
        // Ignore invalid data
      }
    }
  }, []);

  // Auto-open edit dialog when ?edit=WORKER_ID is in the URL
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && workers.length > 0) {
      const worker = workers.find((w) => w.id === editId);
      if (worker) {
        setEditingWorker(worker);
        setFormOpen(true);
        // Clean up the URL
        router.replace('/workers');
      }
    }
  }, [searchParams, workers, router]);

  // Persist selections to localStorage
  useEffect(() => {
    if (selectedCalculationIds.size > 0) {
      localStorage.setItem('compareCalculationIds', JSON.stringify([...selectedCalculationIds]));
    } else {
      localStorage.removeItem('compareCalculationIds');
    }
  }, [selectedCalculationIds]);

  const loadWorkers = async () => {
    try {
      const data = await getWorkers();
      setWorkers(data);
    } catch (error) {
      console.error('Failed to load workers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingWorker(undefined);
    setFormOpen(true);
  };

  const handleEdit = (worker: Worker) => {
    setEditingWorker(worker);
    setFormOpen(true);
  };

  const handleSave = async (data: { name: string; formula_config: FormulaConfig }) => {
    if (editingWorker) {
      await updateWorker(editingWorker.id, data);
    } else {
      await createWorker(data);
    }
    await loadWorkers();
  };

  const handleDelete = async (worker: Worker) => {
    if (confirm(t('deleteConfirm', { name: worker.name }))) {
      await deleteWorker(worker.id);
      await loadWorkers();
    }
  };

  const handleCalculate = (worker: Worker) => {
    router.push(`/calculate?workerId=${worker.id}`);
  };

  const handleSelectionChange = (calculationId: string, selected: boolean) => {
    setSelectedCalculationIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        if (next.size < MAX_COMPARE_SELECTIONS) {
          next.add(calculationId);
        }
      } else {
        next.delete(calculationId);
      }
      return next;
    });
  };

  const handleClearSelections = () => {
    setSelectedCalculationIds(new Set());
  };

  const handleCalculationDeleted = (calculationId: string) => {
    setSelectedCalculationIds((prev) => {
      if (!prev.has(calculationId)) return prev;
      const next = new Set(prev);
      next.delete(calculationId);
      return next;
    });
  };

  const handleCompareSelected = () => {
    // Navigate to comparison page with selected IDs
    const ids = [...selectedCalculationIds].join(',');
    router.push(`/?compare=${ids}`);
  };

  if (loading) {
    return (
      <>
        <TabHeader tab="workers" />
        <div className="container mx-auto p-6">
          <div className="text-center py-12 text-muted-foreground">{tCommon('loading')}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <TabHeader
        tab="workers"
        actions={<Button onClick={handleAdd}>{t('addWorker')}</Button>}
      />
      <div className="container mx-auto p-6">

      {workers.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">{t('noWorkersYet')}</p>
          <Button onClick={handleAdd}>{t('addFirstWorker')}</Button>
        </div>
      ) : (
        <>
          {/* Selection Banner */}
          {selectedCalculationIds.size > 0 && (
            <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="default">
                  {tHistory('selectedCount', { count: selectedCalculationIds.size, max: MAX_COMPARE_SELECTIONS })}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {tHistory('selectPrompt')}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleClearSelections}>
                  {tCommon('clear')}
                </Button>
                <Button
                  size="sm"
                  onClick={handleCompareSelected}
                  disabled={selectedCalculationIds.size < 2}
                >
                  {tCommon('compare')} ({selectedCalculationIds.size})
                </Button>
              </div>
            </div>
          )}

          {/* Worker Cards with History */}
          <div className="space-y-3">
            {workers.map((worker) => (
              <div key={worker.id} className="space-y-1">
                {/* Worker Profile Card */}
                <WorkerCard
                  worker={worker}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onCalculate={handleCalculate}
                />

                {/* Calculation History */}
                <div className="ml-4">
                  <WorkerHistoryCard
                    worker={worker}
                    selectedCalculationIds={selectedCalculationIds}
                    onSelectionChange={handleSelectionChange}
                    maxSelections={MAX_COMPARE_SELECTIONS}
                    onDeleted={handleCalculationDeleted}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <WorkerForm
        worker={editingWorker}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
      />
      </div>
    </>
  );
}

export default function WorkersPage() {
  return (
    <RequireAuth>
      <WorkersPageContent />
    </RequireAuth>
  );
}
