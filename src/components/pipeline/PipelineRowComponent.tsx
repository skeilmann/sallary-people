'use client';

import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useTranslations } from 'next-intl';
import { Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DraggablePipelineItem } from './DraggablePipelineItem';
import type { PipelineRow, PipelineRowResult } from '@/lib/pipeline-types';
import type { Worker } from '@/lib/types';
import { formatCurrency } from '@/lib/formulas';

interface PipelineRowComponentProps {
  row: PipelineRow;
  rowIndex: number;
  rowResult?: PipelineRowResult;
  workers: Worker[];
  onRemoveRow: (rowId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onEditItem: (itemId: string) => void;
  onAddRowBelow: (atIndex: number) => void;
}

export function PipelineRowComponent({
  row,
  rowIndex,
  rowResult,
  workers,
  onRemoveRow,
  onRemoveItem,
  onEditItem,
  onAddRowBelow,
}: PipelineRowComponentProps) {
  const t = useTranslations('pipeline');
  const workerMap = new Map(workers.map(w => [w.id, w]));

  const { setNodeRef, isOver } = useDroppable({
    id: `row-${row.id}`,
    data: { type: 'row', rowId: row.id },
  });

  const itemIds = row.items.map(item => item.id);

  return (
    <div className="group relative">
      {/* Row container */}
      <div
        ref={setNodeRef}
        className={`
          flex items-stretch gap-3 p-3 rounded-xl border-2 transition-all min-h-[64px]
          ${isOver
            ? 'border-primary bg-primary/5 shadow-md'
            : 'border-dashed border-muted-foreground/20 hover:border-muted-foreground/40'
          }
        `}
      >
        {/* Row label + running total */}
        <div className="flex flex-col justify-center min-w-[100px] pr-3 border-r border-muted">
          <span className="text-xs font-semibold text-muted-foreground">
            {t('rowLabel', { number: rowIndex + 1 })}
          </span>
          {rowResult && (
            <span className="text-xs font-mono text-muted-foreground">
              {formatCurrency(rowResult.runningTotalBefore)}
            </span>
          )}
        </div>

        {/* Items in this row */}
        <SortableContext items={itemIds} strategy={horizontalListSortingStrategy}>
          <div className="flex items-center gap-2 flex-wrap flex-1 min-h-[40px]">
            {row.items.length === 0 ? (
              <span className="text-xs text-muted-foreground italic px-2">
                {t('emptyRow')}
              </span>
            ) : (
              row.items.map((item) => {
                const worker = item.workerId ? workerMap.get(item.workerId) : undefined;
                const itemResult = rowResult?.itemResults.find(r => r.itemId === item.id);

                return (
                  <DraggablePipelineItem
                    key={item.id}
                    item={item}
                    result={itemResult}
                    workerName={worker?.name}
                    commissionRate={worker?.formula_config.commissionRate}
                    isIndividualRevenue={worker?.formula_config.revenueSource === 'individual'}
                    onRemove={onRemoveItem}
                    onEdit={onEditItem}
                  />
                );
              })
            )}
          </div>
        </SortableContext>

        {/* Running total after */}
        {rowResult && (
          <div className="flex flex-col justify-center min-w-[100px] pl-3 border-l border-muted text-right">
            <span className="text-[10px] text-muted-foreground">{t('afterDeductions')}</span>
            <span className="text-xs font-mono font-medium">
              {formatCurrency(rowResult.runningTotalAfter)}
            </span>
          </div>
        )}

        {/* Remove row button */}
        <Button
          variant="ghost"
          size="icon"
          className="opacity-0 group-hover:opacity-100 transition-opacity self-center"
          onClick={() => onRemoveRow(row.id)}
          title={t('removeRow')}
        >
          <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
        </Button>
      </div>

      {/* Add row between button */}
      <div className="flex justify-center -my-1 relative z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onAddRowBelow(rowIndex + 1)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors px-2 py-0.5 rounded bg-background border border-transparent hover:border-primary/20"
        >
          <Plus className="w-3 h-3" />
          {t('addRow')}
        </button>
      </div>
    </div>
  );
}
