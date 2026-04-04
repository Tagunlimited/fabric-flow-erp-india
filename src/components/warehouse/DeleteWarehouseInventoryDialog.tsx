import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import type { WarehouseInventory } from '@/types/warehouse-inventory';

export type WarehouseInventoryDeleteRow = WarehouseInventory & {
  consolidatedIds?: string[];
  allocated_quantity?: number;
};

export interface DeleteWarehouseInventoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: WarehouseInventoryDeleteRow | null;
  onDeleted?: () => void;
}

function resolveIds(item: WarehouseInventoryDeleteRow): string[] {
  const extra = item.consolidatedIds;
  if (extra && extra.length > 0) return [...new Set(extra)];
  return [item.id];
}

export const DeleteWarehouseInventoryDialog: React.FC<DeleteWarehouseInventoryDialogProps> = ({
  open,
  onOpenChange,
  item,
  onDeleted,
}) => {
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    if (!item) return;
    const ids = resolveIds(item);
    try {
      setBusy(true);
      const { error } = await supabase.from('warehouse_inventory' as any).delete().in('id', ids);
      if (error) throw error;
      toast.success(
        ids.length > 1 ? `Removed ${ids.length} merged stock lines` : 'Inventory line removed'
      );
      try {
        window.dispatchEvent(new CustomEvent('warehouse-inventory-updated'));
      } catch {
        /* ignore */
      }
      onOpenChange(false);
      onDeleted?.();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to delete inventory');
    } finally {
      setBusy(false);
    }
  };

  if (!item) return null;

  const ids = resolveIds(item);
  const allocated = Number((item as any).allocated_quantity || 0);

  return (
    <AlertDialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this inventory?</AlertDialogTitle>
          <AlertDialogDescription>
            Delete {item.item_name} ({item.item_code}), {item.quantity} {item.unit} from bin{' '}
            {item.bin?.bin_code ?? '—'}. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {(ids.length > 1 || allocated > 0) && (
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            {ids.length > 1 && (
              <li>
                This row combines {ids.length} underlying lines; all will be removed.
              </li>
            )}
            {allocated > 0 && (
              <li className="text-amber-700 dark:text-amber-500">
                Allocations ({allocated} {item.unit}) will be removed with the stock.
              </li>
            )}
          </ul>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={busy} onClick={handleDelete}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting…
              </>
            ) : (
              'Delete'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
