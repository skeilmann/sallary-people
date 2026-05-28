'use client';

import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useTranslations } from 'next-intl';
import { GripVertical, Percent, DollarSign, User, Users, Receipt, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PipelineItem, PipelineRow } from '@/lib/pipeline-types';
import type { Worker } from '@/lib/types';
import { getAvailablePaletteItems, generatePipelineId } from '@/lib/pipeline-utils';

interface ItemPaletteProps {
  rows: PipelineRow[];
  workers: Worker[];
  onAddItem: (item: PipelineItem, targetRowId?: string) => void;
}

// Wrapper for draggable palette items
function DraggablePaletteItem({
  item,
  label,
  placed,
  icon,
  colorClass,
  onAddItem,
}: {
  item: PipelineItem;
  label: string;
  placed: boolean;
  icon: React.ReactNode;
  colorClass: string;
  onAddItem: (item: PipelineItem) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${item.id}`,
    data: { type: 'palette-item', item },
    disabled: placed,
  });

  return (
    <div
      ref={setNodeRef}
      {...(placed ? {} : { ...attributes, ...listeners })}
      onClick={() => !placed && onAddItem(item)}
      className={`
        flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm
        ${placed
          ? 'bg-muted border-muted text-muted-foreground opacity-50 cursor-not-allowed'
          : `${colorClass} cursor-grab active:cursor-grabbing hover:shadow-md`
        }
        ${isDragging ? 'opacity-50 shadow-lg' : ''}
        transition-all
      `}
    >
      {!placed && <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />}
      {icon}
      <span className="text-xs font-medium truncate flex-1">{label}</span>
      {placed && (
        <Badge variant="outline" className="text-[9px] px-1 py-0">✓</Badge>
      )}
    </div>
  );
}

export function ItemPalette({ rows, workers, onAddItem }: ItemPaletteProps) {
  const t = useTranslations('pipeline');
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customType, setCustomType] = useState<'percentage' | 'fixed'>('percentage');
  const [customRate, setCustomRate] = useState(0);
  const [customAmount, setCustomAmount] = useState(0);

  const available = getAvailablePaletteItems(rows, workers);

  const handleAddCustom = () => {
    if (!customLabel.trim()) return;

    const item: PipelineItem = {
      id: generatePipelineId(),
      type: 'custom_deduction',
      label: customLabel.trim(),
      rate: customType === 'percentage' ? customRate : undefined,
      fixedAmount: customType === 'fixed' ? customAmount : undefined,
    };

    onAddItem(item);
    setCustomLabel('');
    setCustomRate(0);
    setCustomAmount(0);
    setShowCustomForm(false);
  };

  const handlePaletteAdd = (item: PipelineItem) => {
    // Create a new item with fresh ID when adding from palette
    onAddItem({ ...item, id: generatePipelineId() });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{t('palette')}</CardTitle>
        <p className="text-xs text-muted-foreground">{t('paletteHint')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Taxes */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2">{t('taxes')}</p>
          <div className="flex flex-wrap gap-2">
            {available.taxes.map(({ taxIndex, placed }) => (
              <DraggablePaletteItem
                key={`tax-${taxIndex}`}
                item={{ id: `palette-tax-${taxIndex}`, type: 'tax', taxIndex }}
                label={t('tax', { index: taxIndex })}
                placed={placed}
                icon={<Percent className="w-3.5 h-3.5" />}
                colorClass="bg-red-50 border-red-200 text-red-800"
                onAddItem={handlePaletteAdd}
              />
            ))}
          </div>
        </div>

        {/* Salaries */}
        {available.salaries.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">{t('salaries')}</p>
            <div className="flex flex-wrap gap-2">
              {available.salaries.map(({ workerId, workerName, placed }) => (
                <DraggablePaletteItem
                  key={`salary-${workerId}`}
                  item={{ id: `palette-salary-${workerId}`, type: 'salary', workerId }}
                  label={t('salary', { name: workerName })}
                  placed={placed}
                  icon={<DollarSign className="w-3.5 h-3.5" />}
                  colorClass="bg-orange-50 border-orange-200 text-orange-800"
                  onAddItem={handlePaletteAdd}
                />
              ))}
            </div>
          </div>
        )}

        {/* Worker Commissions */}
        {available.commissions.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">{t('commissions')}</p>
            <div className="flex flex-wrap gap-2">
              {available.commissions.map(({ workerId, workerName, placed }) => {
                const worker = workers.find(w => w.id === workerId);
                const rate = worker?.formula_config.commissionRate ?? 0;
                return (
                  <DraggablePaletteItem
                    key={`commission-${workerId}`}
                    item={{ id: `palette-commission-${workerId}`, type: 'worker_commission', workerId }}
                    label={t('workerCommission', { name: workerName, rate })}
                    placed={placed}
                    icon={<User className="w-3.5 h-3.5" />}
                    colorClass="bg-blue-50 border-blue-200 text-blue-800"
                    onAddItem={handlePaletteAdd}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Shared Pool Commission */}
        {workers.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">{t('sharedPool')}</p>
            <Button
              variant="outline"
              size="sm"
              className="text-xs bg-indigo-50 border-indigo-200 text-indigo-800 hover:bg-indigo-100"
              onClick={() => {
                const item: PipelineItem = {
                  id: generatePipelineId(),
                  type: 'shared_pool_commission',
                  poolRate: 0,
                  participantIds: [],
                  deductParticipantSalaries: false,
                };
                onAddItem(item);
              }}
            >
              <Users className="w-3.5 h-3.5 mr-1" />
              {t('addSharedPool')}
            </Button>
          </div>
        )}

        {/* Custom Deductions */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2">{t('custom')}</p>

          {!showCustomForm ? (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setShowCustomForm(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {t('addCustom')}
            </Button>
          ) : (
            <div className="space-y-3 p-3 border rounded-lg bg-muted/50">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('customLabel')}</Label>
                <Input
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="e.g., Insurance"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t('customType')}</Label>
                <Select
                  value={customType}
                  onValueChange={(v) => setCustomType(v as 'percentage' | 'fixed')}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">{t('customPercentage')}</SelectItem>
                    <SelectItem value="fixed">{t('customFixed')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {customType === 'percentage' ? (
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('customRate')}</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={customRate || ''}
                    onChange={(e) => setCustomRate(parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs"
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('customAmount')}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    value={customAmount || ''}
                    onChange={(e) => setCustomAmount(parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <Button size="sm" className="text-xs h-7" onClick={handleAddCustom}>
                  {t('addRow')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setShowCustomForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
