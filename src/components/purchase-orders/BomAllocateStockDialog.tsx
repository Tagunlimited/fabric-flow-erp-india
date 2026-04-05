import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import {
  type BomDisplayAllocationTarget,
  buildBulkAllocationRows,
  insertBomInventoryAllocations,
} from './bomInventoryAllocation';

type BomAllocateStockDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bomId: string | null;
  target: BomDisplayAllocationTarget | null;
  onSuccess: () => void | Promise<void>;
};

export function BomAllocateStockDialog({
  open,
  onOpenChange,
  bomId,
  target,
  onSuccess,
}: BomAllocateStockDialogProps) {
  const [allocationSourceId, setAllocationSourceId] = useState('');
  const [allocationQuantity, setAllocationQuantity] = useState('0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !target) return;
    const firstAvailable = target.allocation?.inventorySources?.find((src) => src.available > 0);
    setAllocationSourceId(firstAvailable?.id || '');
    if (target.isBulk) {
      setAllocationQuantity('0');
      setError(null);
      return;
    }
    const requiredRemaining = Math.max(
      (target.required_qty || 0) - (target.allocation?.totalAllocated || 0),
      0
    );
    const defaultQuantity = Math.min(
      requiredRemaining,
      firstAvailable?.available || 0
    );
    setAllocationQuantity(defaultQuantity > 0 ? String(Number(defaultQuantity.toFixed(3))) : '0');
    setError(null);
  }, [open, target]);

  const reset = () => {
    setAllocationSourceId('');
    setAllocationQuantity('0');
    setError(null);
  };

  const handleSubmit = async () => {
    if (!target) return;

    const effectiveBomId = target.bom_id ?? bomId ?? null;

    const selectedSource = target.allocation?.inventorySources?.find((src) => src.id === allocationSourceId);
    if (!allocationSourceId || !selectedSource) {
      setError('Please choose a stock source to allocate from.');
      return;
    }

    const parsedQuantity = Number(allocationQuantity);

    if (!target.isBulk) {
      if (Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
        setError('Please enter a valid allocation quantity greater than zero.');
        return;
      }
      if (parsedQuantity > selectedSource.available) {
        setError(
          `Cannot allocate more than ${selectedSource.available} ${selectedSource.unit || target.stock_unit || ''} from the selected source.`
        );
        return;
      }
      const remainingRequired = Math.max(
        (target.required_qty || 0) - (target.allocation?.totalAllocated || 0),
        0
      );
      if (parsedQuantity > remainingRequired) {
        setError(`Allocation exceeds remaining required quantity (${remainingRequired}).`);
        return;
      }
      if (!target.id) {
        setError('Missing BOM line id.');
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      if (target.isBulk && target.items?.length) {
        const missingBom = target.items.filter((it: { bom_id?: string }) => !it.bom_id);
        if (missingBom.length) {
          setError('Some lines are missing a BOM reference. Refresh the page and try again.');
          setLoading(false);
          return;
        }
        const { rows, error: bulkErr } = buildBulkAllocationRows(
          effectiveBomId || bomId || '',
          allocationSourceId,
          selectedSource as any,
          target.items
        );
        if (bulkErr || !rows.length) {
          setError(bulkErr || 'No allocations to apply.');
          setLoading(false);
          return;
        }
        const result = await insertBomInventoryAllocations(supabase, effectiveBomId || bomId || '', {
          mode: 'bulk',
          rows,
        });
        if (!result.ok) {
          setError(result.error);
          setLoading(false);
          return;
        }
      } else if (target.id) {
        if (!effectiveBomId) {
          setError('Missing BOM reference for this line. Cannot save allocation.');
          setLoading(false);
          return;
        }
        const result = await insertBomInventoryAllocations(supabase, effectiveBomId, {
          mode: 'single',
          warehouseInventoryId: allocationSourceId,
          bomItemId: target.id,
          quantity: parsedQuantity,
          unit: target.stock_unit || selectedSource.unit || target.required_unit || '',
        });
        if (!result.ok) {
          setError(result.error);
          setLoading(false);
          return;
        }
      } else {
        setError('Invalid allocation target.');
        setLoading(false);
        return;
      }

      await onSuccess();
      onOpenChange(false);
      reset();
    } catch (e) {
      console.error(e);
      setError('An unexpected error occurred while allocating stock.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{target?.isBulk ? 'Allocate stock (all lines)' : 'Allocate stock'}</DialogTitle>
        </DialogHeader>
        {target && (
          <div className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground">Item</div>
              <div className="text-base font-semibold">
                {target.isBulk ? 'Multiple BOM lines' : target.item_name}
              </div>
              {!target.isBulk && (
                <>
                  <div className="text-xs text-muted-foreground">
                    Required: {target.required_qty} {target.required_unit}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Allocated: {target.allocation?.totalAllocated || 0} {target.stock_unit}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Available to allocate: {target.allocation?.totalAvailable || 0} {target.stock_unit}
                  </div>
                </>
              )}
              {target.isBulk && (
                <div className="text-xs text-muted-foreground">
                  Uses each line&apos;s remaining need and available bin stock from the selected source.
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Stock source</Label>
              <Select value={allocationSourceId} onValueChange={setAllocationSourceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {(target.allocation?.inventorySources || [])
                    .filter((src) => src.available > 0)
                    .map((src) => (
                      <SelectItem key={src.id} value={src.id}>
                        Bin stock · Available {src.available} {src.unit || target.stock_unit}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {!target.isBulk && (
              <div className="space-y-2">
                <Label>Quantity to allocate</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={allocationQuantity}
                  onChange={(e) => setAllocationQuantity(e.target.value)}
                />
              </div>
            )}

            {error && <div className="text-sm text-red-500">{error}</div>}
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              reset();
            }}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              loading ||
              !target ||
              (!target.isBulk && !(target.bom_id || bomId))
            }
          >
            {loading ? 'Allocating…' : 'Allocate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
