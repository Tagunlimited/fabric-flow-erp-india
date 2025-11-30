import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSizeTypes } from "@/hooks/useSizeTypes";
import { sortSizeDistributionsByMasterOrder } from "@/utils/sizeSorting";

interface SizeItem {
  size_name: string;
  quantity: number; // assigned quantity for that size
}

interface PickerQuantityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  assignmentId: string;
  orderNumber: string;
  customerName?: string;
  sizeDistributions: SizeItem[];
  productImage?: string;
}

export default function PickerQuantityDialog({
  isOpen,
  onClose,
  onSuccess,
  assignmentId,
  orderNumber,
  customerName,
  sizeDistributions,
  productImage,
}: PickerQuantityDialogProps) {
  const { toast } = useToast();
  const { sizeTypes } = useSizeTypes();
  const [pickedBySize, setPickedBySize] = useState<Record<string, number>>({}); // existing picked
  const [rejectedBySize, setRejectedBySize] = useState<Record<string, number>>({}); // existing QC rejected
  const [addBySize, setAddBySize] = useState<Record<string, number>>({}); // increment to add
  const [saving, setSaving] = useState(false);
  const [sizeTypeId, setSizeTypeId] = useState<string | null>(null);

  // Fetch size_type_id from assignment/order when dialog opens
  useEffect(() => {
    if (isOpen && assignmentId) {
      const fetchSizeTypeId = async () => {
        try {
          // Get order_id from assignment
          const { data: assignment } = await supabase
            .from('order_batch_assignments')
            .select('order_id, order_items!inner(size_type_id)')
            .eq('id', assignmentId)
            .limit(1)
            .maybeSingle();
          
          if (assignment && (assignment as any).order_items) {
            const orderItem = Array.isArray((assignment as any).order_items) 
              ? (assignment as any).order_items[0]
              : (assignment as any).order_items;
            if (orderItem?.size_type_id) {
              setSizeTypeId(orderItem.size_type_id);
              return;
            }
          }
          
          // Fallback: try to get from order directly
          const orderId = (assignment as any)?.order_id;
          if (orderId) {
            const { data: orderItems } = await supabase
              .from('order_items')
              .select('size_type_id')
              .eq('order_id', orderId)
              .limit(1);
            if (orderItems && orderItems.length > 0 && orderItems[0].size_type_id) {
              setSizeTypeId(orderItems[0].size_type_id);
            }
          }
        } catch (error) {
          console.error('Error fetching size_type_id:', error);
        }
      };
      fetchSizeTypeId();
    }
  }, [isOpen, assignmentId]);

  // Sort size distributions using master order
  const sortedSizeDistributions = useMemo(() => {
    if (!sizeDistributions || sizeDistributions.length === 0) return [];
    return sortSizeDistributionsByMasterOrder(sizeDistributions, sizeTypeId, sizeTypes);
  }, [sizeDistributions, sizeTypeId, sizeTypes]);

  useEffect(() => {
    const loadPicked = async () => {
      let pickedMap: Record<string, number> = {};
      let rejectedMap: Record<string, number> = {};
      // Attempt 1: from order_batch_size_distributions.picked_quantity (if column exists)
      try {
        const { data } = await (supabase as any)
          .from('order_batch_size_distributions')
          .select('size_name, picked_quantity')
          .eq('order_batch_assignment_id', assignmentId);
        (data || []).forEach((row: any) => {
          if (row?.size_name && typeof row?.picked_quantity !== 'undefined') {
            pickedMap[row.size_name] = Number(row.picked_quantity || 0);
          }
        });
      } catch {
        // ignore, fallback to notes
      }
      // Attempt 2: from order_batch_assignments.notes JSON
      if (Object.keys(pickedMap).length === 0) {
        try {
          const { data: asn } = await (supabase as any)
            .from('order_batch_assignments')
            .select('id, notes')
            .eq('id', assignmentId)
            .maybeSingle();
          if (asn?.notes) {
            try {
              const parsed = JSON.parse(asn.notes);
              if (parsed && parsed.picked_by_size && typeof parsed.picked_by_size === 'object') {
                Object.entries(parsed.picked_by_size as Record<string, any>).forEach(([k, v]) => {
                  pickedMap[k] = Number(v) || 0;
                });
              }
            } catch {}
          }
        } catch {}
      }
      setPickedBySize(pickedMap);
      // Load QC rejections by size (if any)
      try {
        const { data: qcRows } = await (supabase as any)
          .from('qc_reviews')
          .select('size_name, rejected_quantity')
          .eq('order_batch_assignment_id', assignmentId);
        (qcRows || []).forEach((row: any) => {
          if (row?.size_name) {
            rejectedMap[row.size_name] = Number(row.rejected_quantity || 0);
          }
        });
      } catch {}
      setRejectedBySize(rejectedMap);
      // Reset increments to 0 on open
      const zeros: Record<string, number> = {};
      (sizeDistributions || []).forEach(s => { zeros[s.size_name] = 0; });
      setAddBySize(zeros);
    };
    if (isOpen && assignmentId) {
      loadPicked();
    }
  }, [isOpen, assignmentId, sizeDistributions]);

  const assignedTotal = useMemo(() => (sizeDistributions || []).reduce((sum, s) => sum + Number(s.quantity || 0), 0), [sizeDistributions]);
  const pickedTotal = useMemo(() => Object.values(pickedBySize).reduce((a, b) => a + Number(b || 0), 0), [pickedBySize]);
  const addTotal = useMemo(() => Object.values(addBySize).reduce((a, b) => a + Number(b || 0), 0), [addBySize]);

  const getAssigned = (size: string) => Number((sizeDistributions || []).find(s => s.size_name === size)?.quantity || 0);
  const getPicked = (size: string) => Number(pickedBySize[size] || 0);
  const getRejected = (size: string) => Number(rejectedBySize[size] || 0);
  
  // Remaining to pick = (assigned - picked) + rejected
  // This includes:
  // - Pending items: (assigned - picked) - items not yet picked
  // - Rejected items: rejected - items that need replacement
  const getRemaining = (size: string) => {
    const assigned = getAssigned(size);
    const picked = getPicked(size);
    const rejected = getRejected(size);
    const newPicks = Number(addBySize[size] || 0);
    
    // Pending items (not yet picked)
    const pending = Math.max(0, assigned - picked);
    
    // Rejected items that still need replacement (rejected minus what we're picking now)
    const rejectedNeedingReplacement = Math.max(0, rejected - newPicks);
    
    // Total remaining = pending + rejected needing replacement
    return Math.max(0, pending + rejectedNeedingReplacement);
  };

  const incDelta = (size: string, delta: number) => {
    setAddBySize(prev => {
      const next = { ...prev };
      const curr = Number(next[size] || 0);
      const remaining = getRemaining(size);
      const value = Math.max(0, Math.min(remaining, curr + delta));
      next[size] = value;
      return next;
    });
  };

  const setDirectAdd = (size: string, value: number) => {
    setAddBySize(prev => {
      const next = { ...prev };
      const remaining = getRemaining(size);
      const v = Math.max(0, Math.min(remaining, Number(value) || 0));
      next[size] = v;
      return next;
    });
  };

  const persistToNotes = async () => {
    // Merge with existing picked values and write back JSON
    // Key concept: newPickedQuantity = currentPicked - rejected + newPicks
    // This removes rejected items from count and adds new picks (replacements + pending)
    const merged: Record<string, number> = {};
    Object.keys(pickedBySize).forEach(size => {
      const currentPicked = Number(pickedBySize[size] || 0);
      const rejected = Number(rejectedBySize[size] || 0);
      const newPicks = Number(addBySize[size] || 0);
      // Formula: newPicked = currentPicked - rejected + newPicks
      // This ensures rejected items are replaced, not added on top
      // Example: picked=40, rejected=5, newPicks=15 → newPicked = 40-5+15 = 50
      const newPicked = Math.max(0, currentPicked - rejected + newPicks);
      const assigned = getAssigned(size);
      merged[size] = Math.min(newPicked, assigned);
    });
    const payload = { picked_by_size: merged } as any;
    await (supabase as any)
      .from('order_batch_assignments')
      .update({ notes: JSON.stringify(payload) } as any)
      .eq('id', assignmentId);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const sizes = Object.keys(addBySize);
      let columnUpdateWorked = true;
      try {
        await Promise.all(sizes.map(async (sizeName) => {
          const currentPicked = getPicked(sizeName);
          const rejected = getRejected(sizeName);
          const newPicks = Number(addBySize[sizeName] || 0);
          
          // Formula: newPickedQuantity = currentPicked - rejected + newPicks
          // This removes rejected items from picked count and adds new picks
          // Example: picked=40, rejected=5, newPicks=15 → newPicked = 40-5+15 = 50
          // This correctly handles:
          // - Rejected items being replaced (subtracted from current, added as new picks)
          // - Pending items being picked (added as new picks)
          const newPicked = Math.max(0, currentPicked - rejected + newPicks);
          
          // Ensure we don't exceed assigned quantity
          const assigned = getAssigned(sizeName);
          const finalPicked = Math.min(newPicked, assigned);
          
          await (supabase as any)
            .from('order_batch_size_distributions')
            .upsert({
              order_batch_assignment_id: assignmentId,
              size_name: sizeName,
              quantity: assigned,
              picked_quantity: finalPicked
            } as any, { onConflict: 'order_batch_assignment_id,size_name' } as any);
        }));
      } catch (e) {
        columnUpdateWorked = false;
      }
      if (!columnUpdateWorked) {
        await persistToNotes();
      }
      toast({ title: 'Saved', description: 'Picked quantities updated.' });
      onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      toast({ title: 'Save failed', description: 'Could not save picked quantities', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Pick quantities for order {orderNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Product Image Display */}
          {productImage && (
            <div className="flex justify-center">
              <img 
                src={productImage} 
                alt="Product"
                className="w-40 h-40 object-cover rounded-lg border-2 border-primary shadow-md"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Customer:</span>
            <span className="font-medium text-foreground">{customerName || '-'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-blue-100 text-blue-800">Assigned: {assignedTotal}</Badge>
            <Badge className="bg-purple-100 text-purple-800">Picked: {pickedTotal}</Badge>
            {addTotal > 0 && (
              <Badge className="bg-green-100 text-green-800">Add now: {addTotal}</Badge>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {sortedSizeDistributions.map((s) => {
              const assigned = getAssigned(s.size_name);
              const picked = getPicked(s.size_name);
              const rejected = getRejected(s.size_name);
              const remaining = getRemaining(s.size_name);
              const addVal = Number(addBySize[s.size_name] || 0);
              const pending = Math.max(0, assigned - picked);
              const rejectedNeedingReplacement = Math.max(0, rejected - addVal);
              
              return (
                <div key={s.size_name} className="border rounded-lg p-3">
                  <div className="text-sm font-medium mb-2">{s.size_name}</div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => incDelta(s.size_name, -1)}>-</Button>
                    <Input
                      type="number"
                      value={addVal}
                      onChange={(e) => setDirectAdd(s.size_name, Number(e.target.value || 0))}
                      className="w-16 text-center"
                      min={0}
                      max={remaining}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => incDelta(s.size_name, +1)}>+</Button>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground space-y-1">
                    <div className="flex items-center gap-2">
                      <span>Picked {picked} / {assigned}</span>
                    </div>
                    {rejected > 0 && (
                      <div className="text-red-600">
                        Rejected: {rejected} {rejectedNeedingReplacement < rejected && `(${rejectedNeedingReplacement} remaining)`}
                      </div>
                    )}
                    {pending > 0 && (
                      <div>Pending: {pending}</div>
                    )}
                    {remaining > 0 ? (
                      <div className="font-medium">Remaining to pick: {remaining}</div>
                    ) : (
                      <div className="text-green-600">✓ Completed</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || addTotal === 0}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


