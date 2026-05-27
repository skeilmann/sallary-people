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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, RotateCcw, Check, Loader2, AlertCircle } from 'lucide-react';
import { PipelineRowComponent } from './PipelineRowComponent';
import { ItemPalette } from './ItemPalette';
import { PipelinePreview } from './PipelinePreview';
import { DraggablePipelineItem } from './DraggablePipelineItem';
import { EditItemDialog } from './EditItemDialog';
import type {
  PipelineRow,
  PipelineItem,
  CalculationPipeline,
  PipelineExecutionResult,
} from '@/lib/pipeline-types';
import type { Worker, GlobalCalculationInputs } from '@/lib/types';
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
import { usePersistedGlobalInputs, usePersistedIndividualRevenues } from '@/lib/usePersistedInputs';

interface PipelineBuilderProps {
  pipeline: CalculationPipeline | null;
  workers: Worker[];
  onSave: (rows: PipelineRow[], name: string) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function PipelineBuilder({
  pipeline,
  workers,
  onSave,
  onDelete,
}: PipelineBuilderProps) {
  const t = useTranslations('pipeline');
  const tCommon = useTranslations('common');
  const tDashboard = useTranslations('dashboard');

  // Pipeline state
  const [rows, setRows] = useState<PipelineRow[]>(pipeline?.rows ?? []);
  const [pipelineName, setPipelineName] = useState(pipeline?.name ?? 'Default Pipeline');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Hold the latest onSave through a ref so the autosave effect doesn't re-fire
  // every time the parent's callback identity changes after a successful save.
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

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
        await onSaveRef.current(rows, pipelineName);
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
        void onSaveRef.current(latestRowsRef.current, latestNameRef.current);
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

  // Build worker inputs for preview
  const workerInputs = useMemo(() => {
    const inputs: Record<string, { salary?: number; individualRevenue?: number }> = {};
    for (const w of workers) {
      inputs[w.id] = {
        salary: w.formula_config.salaryAmount,
        individualRevenue: individualRevenues[w.id] || 0,
      };
    }
    return inputs;
  }, [workers, individualRevenues]);

  // Live calculation result
  const executionResult: PipelineExecutionResult | null = useMemo(() => {
    if (rows.length === 0 || globalInputs.totalRevenue === 0) return null;
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

  // ==================== Render ====================

  const workerMap = new Map(workers.map(w => [w.id, w]));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
      {/* Main Pipeline Area */}
      <div className="space-y-6">
        {/* Global Inputs for Preview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{tDashboard('globalInputs')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{tDashboard('totalRevenue')}</Label>
                <Input
                  type="number"
                  min="0"
                  step="1000"
                  value={globalInputs.totalRevenue || ''}
                  onChange={(e) =>
                    setGlobalInputs(prev => ({
                      ...prev,
                      totalRevenue: parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="0"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tDashboard('taxRate1')}</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={globalInputs.taxRate1 || ''}
                    onChange={(e) =>
                      setGlobalInputs(prev => ({
                        ...prev,
                        taxRate1: parseFloat(e.target.value) || 0,
                      }))
                    }
                    placeholder="0"
                    className="h-8 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tDashboard('taxRate2')}</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={globalInputs.taxRate2 || ''}
                    onChange={(e) =>
                      setGlobalInputs(prev => ({
                        ...prev,
                        taxRate2: parseFloat(e.target.value) || 0,
                      }))
                    }
                    placeholder="0"
                    className="h-8 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
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
                          value={individualRevenues[w.id] || ''}
                          onChange={(e) =>
                            setIndividualRevenues(prev => ({
                              ...prev,
                              [w.id]: parseFloat(e.target.value) || 0,
                            }))
                          }
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

        {/* Revenue header */}
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

        {/* DnD Context wraps rows and palette */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
        >
          {/* Pipeline Rows */}
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

          {/* Drag overlay */}
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
          {onDelete && pipeline && (
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm(t('deleteConfirm'))) onDelete();
              }}
              className="ml-auto"
            >
              {t('deletePipeline')}
            </Button>
          )}
        </div>
      </div>

      {/* Sidebar: Palette + Preview */}
      <div className="space-y-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
        >
          <ItemPalette
            rows={rows}
            workers={workers}
            onAddItem={handleAddItemFromPalette}
          />
        </DndContext>

        <PipelinePreview result={executionResult} />
      </div>

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
