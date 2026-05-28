'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, RotateCcw, Check, Loader2, AlertCircle } from 'lucide-react';
import { PipelineRowComponent } from './PipelineRowComponent';
import { ItemPalette } from './ItemPalette';
import { DraggablePipelineItem } from './DraggablePipelineItem';
import { EditItemDialog } from './EditItemDialog';
import { WorkerBonusCard } from '@/components/WorkerBonusCard';
import {
  BulkSavePipelineModal,
  type BulkSaveFailure,
  type BulkSaveRow,
} from '@/components/BulkSavePipelineModal';
import type {
  PipelineRow,
  PipelineItem,
  CalculationPipeline,
  PipelineExecutionResult,
} from '@/lib/pipeline-types';
import type {
  Worker,
  Quarter,
  CalculationWithWorker,
} from '@/lib/types';
import {
  addRow,
  removeRow,
  removeItem,
  updateItem,
  findItemRow,
  generatePipelineId,
  generateDefaultPipeline,
} from '@/lib/pipeline-utils';
import { executePipeline } from '@/lib/pipeline-engine';
import { formatCurrency } from '@/lib/formulas';
import {
  usePersistedGlobalInputs,
  usePersistedIndividualRevenues,
} from '@/lib/usePersistedInputs';

const quarters: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];

export interface SaveBonusInput {
  workerId: string;
  calculatedAmount: number;
  adjustmentAmount: number;
  adjustmentNote: string;
  finalAmount: number;
  salary: number;
  individualRevenue?: number;
}

interface PipelineBuilderProps {
  pipeline: CalculationPipeline | null;
  workers: Worker[];
  onSavePipeline: (rows: PipelineRow[], name: string) => Promise<void>;
  onDeletePipeline?: () => Promise<void>;
  /** Saved bonuses for the currently selected period, grouped by worker. */
  calculationsByWorker: Record<string, CalculationWithWorker[]>;
  /** Selected quarter, controlled by the parent page (via usePersistedPeriod). */
  quarter: Quarter;
  /** Selected year, controlled by the parent page. */
  year: number;
  /** Available years for the period dropdown. */
  years: number[];
  /** Computed period string like "Q2 2026". */
  period: string;
  onQuarterChange: (q: Quarter) => void;
  onYearChange: (y: number) => void;
  onSaveBonus: (data: SaveBonusInput) => Promise<void>;
  onBulkSaveBonuses: (rows: BulkSaveRow[]) => Promise<BulkSaveFailure[]>;
}

export function PipelineBuilder({
  pipeline,
  workers,
  onSavePipeline,
  onDeletePipeline,
  calculationsByWorker,
  quarter,
  year,
  years,
  period,
  onQuarterChange,
  onYearChange,
  onSaveBonus,
  onBulkSaveBonuses,
}: PipelineBuilderProps) {
  const t = useTranslations('pipeline');
  const tCommon = useTranslations('common');
  const tDashboard = useTranslations('dashboard');

  // Pipeline state
  const [rows, setRows] = useState<PipelineRow[]>(pipeline?.rows ?? []);
  const [pipelineName, setPipelineName] = useState(pipeline?.name ?? 'Default Pipeline');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Hold the latest onSavePipeline through a ref so the autosave effect doesn't
  // re-fire every time the parent's callback identity changes after a save.
  const onSavePipelineRef = useRef(onSavePipeline);
  useEffect(() => {
    onSavePipelineRef.current = onSavePipeline;
  }, [onSavePipeline]);

  // Latest values, used by the unmount-flush so we save what's actually current
  // even if React hasn't run the autosave effect for the very last edit yet.
  const latestRowsRef = useRef(rows);
  const latestNameRef = useRef(pipelineName);
  useEffect(() => {
    latestRowsRef.current = rows;
  }, [rows]);
  useEffect(() => {
    latestNameRef.current = pipelineName;
  }, [pipelineName]);

  // Debounced autosave on every edit. Skips the initial mount so we don't save
  // the just-loaded server state back to the server.
  const isInitialMount = useRef(true);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      autoSaveTimerRef.current = null;
      setAutoSaveStatus('saving');
      try {
        await onSavePipelineRef.current(rows, pipelineName);
        setAutoSaveStatus('saved');
      } catch {
        setAutoSaveStatus('error');
      }
    }, 600);
  }, [rows, pipelineName]);

  // Flush a pending save when the component unmounts (e.g. on tab navigation),
  // otherwise the debounce timer is cleared and the last edit is lost — which
  // was the original bug.
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
        void onSavePipelineRef.current(latestRowsRef.current, latestNameRef.current);
      }
    };
  }, []);

  // Fade the "Saved" badge back to idle after a couple of seconds.
  useEffect(() => {
    if (autoSaveStatus !== 'saved') return;
    const id = setTimeout(() => setAutoSaveStatus('idle'), 2000);
    return () => clearTimeout(id);
  }, [autoSaveStatus]);

  // Persisted global inputs (shared with Dashboard, survives refresh)
  const { globalInputs, setGlobalInputs } = usePersistedGlobalInputs();

  // Persisted individual revenues (shared with Dashboard, survives refresh)
  const { individualRevenues, setIndividualRevenues } = usePersistedIndividualRevenues();

  // Dashboard-local override: when a saved calc exists for the selected quarter,
  // its individual revenue is seeded here. Survives within this surface only.
  const [quarterIndividualRevenue, setQuarterIndividualRevenue] = useState<
    Record<string, number>
  >({});

  // Bulk save state — mirrors Dashboard.
  const [selectedForBulkSave, setSelectedForBulkSave] = useState<Set<string>>(new Set());
  const [bulkSaveOpen, setBulkSaveOpen] = useState(false);

  // Seed individual-revenue overrides from saved values whenever the period's
  // saved data changes (load or after save).
  useEffect(() => {
    const seed: Record<string, number> = {};
    for (const [workerId, calcs] of Object.entries(calculationsByWorker)) {
      const latest = calcs[0];
      const v = latest?.inputs.individualRevenue;
      if (v !== undefined && v !== null) seed[workerId] = v;
    }
    setQuarterIndividualRevenue(seed);
  }, [calculationsByWorker]);

  const readIndividualRevenue = (workerId: string): number =>
    quarterIndividualRevenue[workerId] ?? individualRevenues[workerId] ?? 0;

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<PipelineItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Build worker inputs for execution (uses period-aware revenue reader)
  const workerInputs = useMemo(() => {
    const inputs: Record<string, { salary?: number; individualRevenue?: number }> = {};
    for (const w of workers) {
      inputs[w.id] = {
        salary: w.formula_config.salaryAmount,
        individualRevenue:
          w.formula_config.revenueSource === 'individual'
            ? readIndividualRevenue(w.id)
            : undefined,
      };
    }
    return inputs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workers, individualRevenues, quarterIndividualRevenue]);

  // Live calculation result
  const executionResult: PipelineExecutionResult | null = useMemo(() => {
    if (rows.length === 0) return null;
    try {
      const pipelineForExec: CalculationPipeline = {
        id: pipeline?.id ?? '',
        name: pipelineName,
        rows,
        created_at: '',
        updated_at: '',
      };
      return executePipeline(pipelineForExec, globalInputs, workers, workerInputs);
    } catch {
      return null;
    }
  }, [rows, globalInputs, workers, workerInputs, pipeline?.id, pipelineName]);

  // Per-worker salary that was netted against the worker's bonus by the
  // pipeline. Only the auto-netted portion counts here — when a salary card
  // does NOT meet the netting condition, the engine instead credits the
  // salary to the worker's payout (workerCommissions), so it is not a
  // deduction from the worker's perspective and must be excluded from this
  // memo. Used by WorkerBonusCard to render the "- salary" formula label.
  const pipelineSalaryByWorker = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    if (!executionResult) return out;
    for (const row of executionResult.rowResults) {
      for (const item of row.itemResults) {
        if (!item.workerId) continue;
        if (item.type === 'salary') {
          out[item.workerId] = (out[item.workerId] ?? 0) + (item.nettedSalary || 0);
        }
      }
    }
    return out;
  }, [executionResult]);

  // ==================== DnD Handlers ====================

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);

    // Check if dragging from palette
    const paletteData = active.data.current;
    if (paletteData?.type === 'palette-item') {
      setActiveItem(paletteData.item as PipelineItem);
    } else {
      // Dragging from existing row
      const item = rows.flatMap(r => r.items).find(i => i.id === active.id);
      setActiveItem(item ?? null);
    }
  }, [rows]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveItem(null);

    if (!over) return;

    const activeData = active.data.current;
    const overId = over.id as string;

    // Determine target row
    let targetRowId: string | null = null;
    if (overId.startsWith('row-')) {
      targetRowId = overId.replace('row-', '');
    } else {
      // Dropped on another item — find its row
      const targetRow = findItemRow(rows, overId);
      targetRowId = targetRow?.id ?? null;
    }

    if (!targetRowId) return;

    // Case 1: Palette item dropped into a row
    if (activeData?.type === 'palette-item') {
      const paletteItem = activeData.item as PipelineItem;
      const newItem: PipelineItem = {
        ...paletteItem,
        id: generatePipelineId(),
      };

      setRows(prev =>
        prev.map(r =>
          r.id === targetRowId
            ? { ...r, items: [...r.items, newItem] }
            : r
        )
      );
      return;
    }

    // Case 2: Moving existing item
    const activeItemId = active.id as string;
    const sourceRow = findItemRow(rows, activeItemId);

    if (!sourceRow) return;

    if (sourceRow.id === targetRowId) {
      // Same row — reorder
      const oldIndex = sourceRow.items.findIndex(i => i.id === activeItemId);
      const overItem = sourceRow.items.find(i => i.id === overId);
      const newIndex = overItem
        ? sourceRow.items.indexOf(overItem)
        : sourceRow.items.length;

      if (oldIndex !== newIndex) {
        setRows(prev =>
          prev.map(r =>
            r.id === targetRowId
              ? { ...r, items: arrayMove(r.items, oldIndex, newIndex) }
              : r
          )
        );
      }
    } else {
      // Different row — move item
      const movedItem = sourceRow.items.find(i => i.id === activeItemId);
      if (!movedItem) return;

      setRows(prev => {
        const updated = prev.map(r => {
          if (r.id === sourceRow.id) {
            return { ...r, items: r.items.filter(i => i.id !== activeItemId) };
          }
          if (r.id === targetRowId) {
            return { ...r, items: [...r.items, movedItem] };
          }
          return r;
        });
        return updated;
      });
    }
  }, [rows]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    // Visual feedback handled by droppable's isOver
  }, []);

  // ==================== Row/Item Actions ====================

  const handleAddRow = useCallback((atIndex?: number) => {
    setRows(prev => addRow(prev, atIndex));
  }, []);

  const handleRemoveRow = useCallback((rowId: string) => {
    setRows(prev => removeRow(prev, rowId));
  }, []);

  const handleRemoveItem = useCallback((itemId: string) => {
    setRows(prev => removeItem(prev, itemId));
  }, []);

  // ==================== Edit Item ====================

  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const editingItem = useMemo<PipelineItem | null>(() => {
    if (!editingItemId) return null;
    return rows.flatMap(r => r.items).find(i => i.id === editingItemId) ?? null;
  }, [editingItemId, rows]);

  const handleEditItem = useCallback((itemId: string) => {
    setEditingItemId(itemId);
  }, []);

  const handleUpdateItem = useCallback((patch: Partial<PipelineItem>) => {
    if (!editingItemId) return;
    setRows(prev => updateItem(prev, editingItemId, patch));
    setEditingItemId(null);
  }, [editingItemId]);

  const handleCancelEdit = useCallback(() => {
    setEditingItemId(null);
  }, []);

  const handleAddItemFromPalette = useCallback((item: PipelineItem) => {
    // If no rows exist, create one first
    if (rows.length === 0) {
      const newRowId = generatePipelineId();
      setRows([{
        id: newRowId,
        items: [{ ...item, id: generatePipelineId() }],
      }]);
      return;
    }
    // Add to the last row
    const lastRow = rows[rows.length - 1];
    setRows(prev =>
      prev.map(r =>
        r.id === lastRow.id
          ? { ...r, items: [...r.items, { ...item, id: generatePipelineId() }] }
          : r
      )
    );
  }, [rows]);

  const handleReset = useCallback(() => {
    const defaultPipeline = generateDefaultPipeline(workers);
    setRows(defaultPipeline.rows);
    setPipelineName(defaultPipeline.name);
  }, [workers]);

  // ==================== Save handlers (per-card + bulk) ====================

  const handleSaveBonus = async (data: SaveBonusInput) => {
    await onSaveBonus(data);
  };

  const handleBulkSaveConfirm = async (
    bulkRows: BulkSaveRow[],
  ): Promise<BulkSaveFailure[]> => {
    const failures = await onBulkSaveBonuses(bulkRows);
    const succeededIds = new Set(
      bulkRows.filter((r) => !failures.find((f) => f.workerId === r.workerId)).map((r) => r.workerId),
    );
    setSelectedForBulkSave((prev) => {
      const next = new Set(prev);
      for (const id of succeededIds) next.delete(id);
      return next;
    });
    return failures;
  };

  // ==================== Render ====================

  const workerMap = new Map(workers.map(w => [w.id, w]));

  // Eligible workers for bulk save (need either individual revenue source or
  // a non-zero global revenue to produce a meaningful number).
  const eligibleWorkerIds = workers
    .filter((w) =>
      w.formula_config.revenueSource === 'individual' || globalInputs.totalRevenue > 0,
    )
    .map((w) => w.id);
  const allSelected =
    eligibleWorkerIds.length > 0 &&
    eligibleWorkerIds.every((id) => selectedForBulkSave.has(id));

  // Snapshot of individual revenues used by the bulk save modal.
  const bulkIndividualRevenues = useMemo(() => {
    const m: Record<string, number> = {};
    for (const w of workers) m[w.id] = readIndividualRevenue(w.id);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workers, individualRevenues, quarterIndividualRevenue]);

  return (
    <div className="space-y-6">
      {/* Top: Available Elements palette (full width) — own DnDContext */}
      <DndContext sensors={sensors} collisionDetection={closestCenter}>
        <ItemPalette
          rows={rows}
          workers={workers}
          onAddItem={handleAddItemFromPalette}
        />
      </DndContext>

      {/* Two-column main area */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* LEFT: Inputs + pipeline rows + actions */}
        <div className="space-y-6">
          {/* Dashboard-style Global Inputs */}
          <Card>
            <CardHeader>
              <CardTitle>{tDashboard('globalInputs')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Period */}
                <div className="space-y-2">
                  <Label>{tDashboard('period')}</Label>
                  <div className="flex gap-2">
                    <Select value={quarter} onValueChange={(v) => onQuarterChange(v as Quarter)}>
                      <SelectTrigger className="w-24">
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
                    <Select value={year.toString()} onValueChange={(v) => onYearChange(parseInt(v))}>
                      <SelectTrigger className="w-24">
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

                {/* Total Revenue */}
                <div className="space-y-2">
                  <Label htmlFor="pipeline-revenue">{tDashboard('totalRevenue')}</Label>
                  <Input
                    id="pipeline-revenue"
                    type="number"
                    min="0"
                    step="1000"
                    value={globalInputs.totalRevenue || ''}
                    onChange={(e) =>
                      setGlobalInputs((prev) => ({
                        ...prev,
                        totalRevenue: parseFloat(e.target.value) || 0,
                      }))
                    }
                    placeholder="0"
                  />
                </div>

                {/* Tax Rate 1 */}
                <div className="space-y-2">
                  <Label htmlFor="pipeline-tax1">{tDashboard('taxRate1')}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="pipeline-tax1"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={globalInputs.taxRate1 || ''}
                      onChange={(e) =>
                        setGlobalInputs((prev) => ({
                          ...prev,
                          taxRate1: parseFloat(e.target.value) || 0,
                        }))
                      }
                      placeholder="0"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </div>

                {/* Tax Rate 2 */}
                <div className="space-y-2">
                  <Label htmlFor="pipeline-tax2">{tDashboard('taxRate2')}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="pipeline-tax2"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={globalInputs.taxRate2 || ''}
                      onChange={(e) =>
                        setGlobalInputs((prev) => ({
                          ...prev,
                          taxRate2: parseFloat(e.target.value) || 0,
                        }))
                      }
                      placeholder="0"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </div>
              </div>

              {/* Individual revenue inputs for applicable workers */}
              {workers.filter(w => w.formula_config.revenueSource === 'individual').length > 0 && (
                <div className="mt-4 pt-3 border-t space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Individual Revenues</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {workers
                      .filter(w => w.formula_config.revenueSource === 'individual')
                      .map(w => (
                        <div key={w.id} className="flex items-center gap-2">
                          <Label className="text-xs min-w-[80px]">{w.name}</Label>
                          <Input
                            type="number"
                            min="0"
                            step="1000"
                            value={readIndividualRevenue(w.id) || ''}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              setIndividualRevenues(prev => ({ ...prev, [w.id]: v }));
                              setQuarterIndividualRevenue(prev => ({ ...prev, [w.id]: v }));
                            }}
                            placeholder="0"
                            className="h-7 text-xs"
                          />
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Revenue / Final Total ribbon */}
          {globalInputs.totalRevenue > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border-2 border-green-200 rounded-xl">
              <span className="text-sm font-medium text-green-800">{t('revenue')}</span>
              <span className="text-lg font-mono font-bold text-green-800">
                {formatCurrency(globalInputs.totalRevenue)}
              </span>
              {executionResult && (
                <div className="ml-auto flex items-center gap-2 pl-3 border-l border-green-300">
                  <span className="text-xs font-medium text-green-700">{t('finalTotal')}</span>
                  <span className="text-lg font-mono font-bold text-green-900">
                    {formatCurrency(executionResult.finalRunningTotal)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* DnD Context wraps pipeline rows */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
          >
            <div className="space-y-2">
              {rows.map((row, index) => (
                <PipelineRowComponent
                  key={row.id}
                  row={row}
                  rowIndex={index}
                  rowResult={executionResult?.rowResults[index]}
                  workers={workers}
                  onRemoveRow={handleRemoveRow}
                  onRemoveItem={handleRemoveItem}
                  onEditItem={handleEditItem}
                  onAddRowBelow={handleAddRow}
                />
              ))}
            </div>

            {/* Add first row button when empty */}
            {rows.length === 0 && (
              <div className="flex justify-center py-8">
                <Button variant="outline" onClick={() => handleAddRow()}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('addRow')}
                </Button>
              </div>
            )}

            {/* Add row at bottom */}
            {rows.length > 0 && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => handleAddRow()}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  {t('addRow')}
                </Button>
              </div>
            )}

            <DragOverlay>
              {activeItem && (
                <DraggablePipelineItem
                  item={activeItem}
                  workerName={activeItem.workerId ? workerMap.get(activeItem.workerId)?.name : undefined}
                  commissionRate={activeItem.workerId ? workerMap.get(activeItem.workerId)?.formula_config.commissionRate : undefined}
                  disabled
                />
              )}
            </DragOverlay>
          </DndContext>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t">
            <div className="flex items-center gap-2 text-xs text-muted-foreground min-h-8" aria-live="polite">
              {autoSaveStatus === 'saving' && (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('saving')}</span>
                </>
              )}
              {autoSaveStatus === 'saved' && (
                <>
                  <Check className="w-3.5 h-3.5 text-green-600" />
                  <span>{t('saved')}</span>
                </>
              )}
              {autoSaveStatus === 'error' && (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                  <span className="text-destructive">{t('saveFailed')}</span>
                </>
              )}
            </div>
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="w-4 h-4 mr-2" />
              {t('reset')}
            </Button>
            {onDeletePipeline && pipeline && (
              <Button
                variant="destructive"
                onClick={() => {
                  if (confirm(t('deleteConfirm'))) onDeletePipeline();
                }}
                className="ml-auto"
              >
                {t('deletePipeline')}
              </Button>
            )}
          </div>
        </div>

        {/* RIGHT: Worker bonus cards + bulk save controls */}
        <aside className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {tDashboard('workerBonuses')}
            </h2>
            <Badge variant="outline" className="text-xs">{period}</Badge>
          </div>

          {/* Total bonuses across all workers in the current pipeline run */}
          {executionResult && (
            <div className="flex items-center justify-between px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
              <span className="text-xs font-medium text-muted-foreground">
                {tDashboard('totalBonuses')}
              </span>
              <span className="text-base font-mono font-bold text-primary tabular-nums">
                {formatCurrency(
                  Object.values(executionResult.workerCommissions).reduce(
                    (sum, c) => sum + c,
                    0,
                  ),
                )}
              </span>
            </div>
          )}

          {executionResult && eligibleWorkerIds.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() =>
                  setSelectedForBulkSave(
                    allSelected ? new Set() : new Set(eligibleWorkerIds),
                  )
                }
                disabled={eligibleWorkerIds.length === 0}
              >
                {allSelected ? tDashboard('deselectAll') : tDashboard('selectAll')}
              </Button>
              <Button
                size="sm"
                className="text-xs flex-1"
                onClick={() => setBulkSaveOpen(true)}
                disabled={selectedForBulkSave.size === 0}
              >
                {tDashboard('saveSelectedForPeriod', {
                  count: selectedForBulkSave.size,
                  period,
                })}
              </Button>
            </div>
          )}

          <div className="space-y-3">
            {workers.map((worker) => {
              const isIndividual = worker.formula_config.revenueSource === 'individual';
              // Empty-state placeholder when global revenue is required but missing
              if (!isIndividual && globalInputs.totalRevenue === 0) {
                return (
                  <Card key={worker.id} className="border-dashed opacity-60">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">
                        <Link
                          href={`/workers?edit=${worker.id}`}
                          className="hover:underline hover:text-primary transition-colors"
                        >
                          {worker.name}
                        </Link>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-3 text-center text-muted-foreground text-xs">
                      {tDashboard('enterRevenueFirst')}
                    </CardContent>
                  </Card>
                );
              }

              const pipelineCommission = executionResult?.workerCommissions[worker.id];
              const pipelineBreakdown = executionResult?.workerBreakdowns[worker.id];

              const latestForPeriod = calculationsByWorker[worker.id]?.[0];
              const savedSnapshot = latestForPeriod
                ? {
                    id: latestForPeriod.id,
                    salary: latestForPeriod.inputs.salary,
                    adjustmentAmount: latestForPeriod.adjustment_amount,
                    adjustmentNote: latestForPeriod.adjustment_note,
                    calculatedAmount: latestForPeriod.calculated_amount,
                  }
                : null;

              const hasSavedForPeriod = !!latestForPeriod;

              return (
                <div key={worker.id} className="relative">
                  {hasSavedForPeriod && (
                    <Badge className="absolute -top-2 -right-2 z-10 bg-green-600">
                      {tDashboard('saved')}
                    </Badge>
                  )}
                  <WorkerBonusCard
                    worker={worker}
                    globalInputs={globalInputs}
                    individualRevenue={readIndividualRevenue(worker.id)}
                    onIndividualRevenueChange={(value) => {
                      setIndividualRevenues((prev) => ({ ...prev, [worker.id]: value }));
                      setQuarterIndividualRevenue((prev) => ({ ...prev, [worker.id]: value }));
                    }}
                    pipelineCommissionAmount={pipelineCommission}
                    pipelineBaseAmount={pipelineBreakdown?.baseAmount}
                    pipelineSalaryDeducted={pipelineSalaryByWorker[worker.id]}
                    savedSnapshot={savedSnapshot}
                    showSelectionCheckbox={!!executionResult}
                    isSelected={selectedForBulkSave.has(worker.id)}
                    onSelectionChange={(checked) => {
                      setSelectedForBulkSave((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(worker.id);
                        else next.delete(worker.id);
                        return next;
                      });
                    }}
                    onSave={handleSaveBonus}
                  />
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {/* Bulk save modal */}
      {executionResult && (
        <BulkSavePipelineModal
          open={bulkSaveOpen}
          onClose={() => setBulkSaveOpen(false)}
          workers={workers.filter((w) => selectedForBulkSave.has(w.id))}
          pipelineResult={executionResult}
          individualRevenues={bulkIndividualRevenues}
          period={period}
          onConfirm={handleBulkSaveConfirm}
        />
      )}

      <EditItemDialog
        item={editingItem}
        rows={rows}
        workers={workers}
        onSave={handleUpdateItem}
        onClose={handleCancelEdit}
      />
    </div>
  );
}
