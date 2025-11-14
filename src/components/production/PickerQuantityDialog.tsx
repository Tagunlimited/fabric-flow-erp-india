import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  const [pickedBySize, setPickedBySize] = useState<Record<string, number>>({}); // existing picked
  const [rejectedBySize, setRejectedBySize] = useState<Record<string, number>>({}); // existing QC rejected
  const [addBySize, setAddBySize] = useState<Record<string, number>>({}); // increment to add
  const [saving, setSaving] = useState(false);

  // Define size order for proper sorting
  const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 
    '20', '22', '24', '26', '28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48', '50',
    '0-2 Yrs', '3-4 Yrs', '5-6 Yrs', '7-8 Yrs', '9-10 Yrs', '11-12 Yrs', '13-14 Yrs', '15-16 Yrs'];
  
  // Sort size distributions in proper order
  const sortedSizeDistributions = useMemo(() => {
    return [...(sizeDistributions || [])].sort((a, b) => {
      const indexA = sizeOrder.indexOf(a.size_name);
      const indexB = sizeOrder.indexOf(b.size_name);
      
      // If both sizes are in the order array, sort by their position
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      // If only one is in the order array, prioritize it
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      // Otherwise, sort alphabetically
      return a.size_name.localeCompare(b.size_name);
    });
  }, [sizeDistributions]);

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
  // Effective rejected = rejected minus newly picked items that compensate for rejected ones
  const getEffectiveRejected = (size: string) => {
    const rejected = getRejected(size);
    const newPicks = Number(addBySize[size] || 0);
    return Math.max(0, rejected - newPicks);
  };
  // Remaining = assigned - (picked - effective rejected) = assigned - picked + effective rejected
  // Rejected items need to be re-picked, but only show net rejected (after accounting for new picks)
  const getRemaining = (size: string) => {
    const effectiveRejected = getEffectiveRejected(size);
    return Math.max(0, getAssigned(size) - getPicked(size) + effectiveRejected);
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
    // When rejected items exist, new picks replace them (don't add on top)
    const merged: Record<string, number> = {};
    Object.keys(pickedBySize).forEach(size => {
      const currentPicked = Number(pickedBySize[size] || 0);
      const rejected = Number(rejectedBySize[size] || 0);
      const newPicks = Number(addBySize[size] || 0);
      // New picked = (current picked - rejected) + new picks
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
          // New picked = (current picked - rejected) + new picks
          // This ensures rejected items are replaced, not added on top
          // Example: picked=10, rejected=1, newPicks=1 → newPicked = (10-1)+1 = 10
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
              const effectiveRejected = getEffectiveRejected(s.size_name);
              const remaining = getRemaining(s.size_name);
              const addVal = Number(addBySize[s.size_name] || 0);
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
                  <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                    <span>Picked {picked} / {assigned}</span>
                    {effectiveRejected > 0 && <span>• Rejected {effectiveRejected}</span>}
                    {remaining > 0 ? <span>• Remaining {remaining}</span> : <span>• Completed</span>}
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


