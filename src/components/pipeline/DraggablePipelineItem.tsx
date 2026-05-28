'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslations } from 'next-intl';
import { X, Pencil, GripVertical, Percent, DollarSign, User, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PipelineItem, PipelineItemResult } from '@/lib/pipeline-types';
import { formatCurrency } from '@/lib/formulas';

interface DraggablePipelineItemProps {
  item: PipelineItem;
  result?: PipelineItemResult;
  workerName?: string;
  commissionRate?: number;
  isIndividualRevenue?: boolean;
  onRemove?: (itemId: string) => void;
  onEdit?: (itemId: string) => void;
  disabled?: boolean;
}

const typeColors: Record<string, string> = {
  tax: 'bg-red-50 border-red-200 text-red-800',
  salary: 'bg-orange-50 border-orange-200 text-orange-800',
  worker_commission: 'bg-blue-50 border-blue-200 text-blue-800',
  custom_deduction: 'bg-purple-50 border-purple-200 text-purple-800',
};

const typeIcons: Record<string, React.ReactNode> = {
  tax: <Percent className="w-3.5 h-3.5" />,
  salary: <DollarSign className="w-3.5 h-3.5" />,
  worker_commission: <User className="w-3.5 h-3.5" />,
  custom_deduction: <Receipt className="w-3.5 h-3.5" />,
};

export function DraggablePipelineItem({
  item,
  result,
  workerName,
  commissionRate,
  isIndividualRevenue,
  onRemove,
  onEdit,
  disabled,
}: DraggablePipelineItemProps) {
  const t = useTranslations('pipeline');

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto' as number | 'auto',
  };

  const getItemLabel = (): string => {
    switch (item.type) {
      case 'tax':
        return t('tax', { index: item.taxIndex ?? 1 });
      case 'salary':
        return workerName ? t('salary', { name: workerName }) : 'Salary';
      case 'worker_commission':
        return workerName && commissionRate !== undefined
          ? t('workerCommission', { name: workerName, rate: commissionRate })
          : 'Commission';
      case 'custom_deduction':
        return item.label ?? t('customDeduction');
      default:
        return 'Unknown';
    }
  };

  const getResultDisplay = (): string | null => {
    if (!result) return null;
    if (item.type === 'worker_commission' && result.commissionAmount !== undefined) {
      const netted = result.nettedSalary ?? 0;
      const netAmount = result.commissionAmount - netted;
      return `${t('earns')} ${formatCurrency(netAmount)}`;
    }
    if (item.type === 'salary' && result.nettedSalary !== undefined) {
      // Salary was netted against a prior bonus — the company didn't spend
      // additional cash, the worker's payout is reduced instead.
      return `-${formatCurrency(result.nettedSalary)}`;
    }
    if (result.deductedAmount > 0) {
      return `-${formatCurrency(result.deductedAmount)}`;
    }
    return null;
  };

  const colorClass = typeColors[item.type] || 'bg-gray-50 border-gray-200';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center gap-2 px-3 py-2 rounded-lg border-2
        ${colorClass}
        ${isDragging ? 'shadow-lg ring-2 ring-primary' : 'shadow-sm'}
        ${disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}
        transition-shadow min-w-[140px]
      `}
    >
      {!disabled && (
        <div {...attributes} {...listeners} className="text-muted-foreground hover:text-foreground">
          <GripVertical className="w-4 h-4" />
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {typeIcons[item.type]}
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium truncate">{getItemLabel()}</span>
          {result && (
            <span className={`text-[10px] font-mono ${
              item.type === 'worker_commission' ? 'text-blue-600' : 'text-red-600'
            }`}>
              {getResultDisplay()}
            </span>
          )}
        </div>
      </div>

      {isIndividualRevenue && (
        <Badge variant="outline" className="text-[9px] px-1 py-0 bg-blue-100 border-blue-300">
          {t('usesOwnRevenue')}
        </Badge>
      )}

      {onEdit && !disabled && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onEdit(item.id);
          }}
          className="text-muted-foreground hover:text-primary transition-colors p-0.5"
          title={t('editItem')}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}

      {onRemove && !disabled && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.id);
          }}
          className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
          title={t('removeItem')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/** Non-draggable version for the palette */
export function PaletteItem({
  item,
  workerName,
  commissionRate,
  placed,
}: {
  item: PipelineItem;
  workerName?: string;
  commissionRate?: number;
  placed: boolean;
}) {
  const t = useTranslations('pipeline');

  const getItemLabel = (): string => {
    switch (item.type) {
      case 'tax':
        return t('tax', { index: item.taxIndex ?? 1 });
      case 'salary':
        return workerName ? t('salary', { name: workerName }) : 'Salary';
      case 'worker_commission':
        return workerName && commissionRate !== undefined
          ? t('workerCommission', { name: workerName, rate: commissionRate })
          : 'Commission';
      case 'custom_deduction':
        return item.label ?? t('customDeduction');
      default:
        return 'Unknown';
    }
  };

  const colorClass = placed
    ? 'bg-muted border-muted text-muted-foreground opacity-50'
    : typeColors[item.type] || 'bg-gray-50 border-gray-200';

  return (
    <div
      className={`
        flex items-center gap-2 px-3 py-2 rounded-lg border-2
        ${colorClass}
        ${placed ? 'cursor-not-allowed' : 'cursor-grab'}
        text-sm min-w-[120px]
      `}
    >
      {!placed && <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />}
      {typeIcons[item.type]}
      <span className="text-xs font-medium truncate">{getItemLabel()}</span>
      {placed && (
        <Badge variant="outline" className="text-[9px] px-1 py-0 ml-auto">
          ✓
        </Badge>
      )}
    </div>
  );
}
