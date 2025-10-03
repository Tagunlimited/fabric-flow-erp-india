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
}

export default function PickerQuantityDialog({
  isOpen,
  onClose,
  onSuccess,
  assignmentId,
  orderNumber,
  customerName,
  sizeDistributions,
}: PickerQuantityDialogProps) {
  const { toast } = useToast();
  const [pickedBySize, setPickedBySize] = useState<Record<string, number>>({}); // existing picked
  const [rejectedBySize, setRejectedBySize] = useState<Record<string, number>>({}); // existing QC rejected
  const [addBySize, setAddBySize] = useState<Record<string, number>>({}); // increment to add
  const [saving, setSaving] = useState(false);

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
  // Remaining after QC = assigned - picked + rejected
  const getRemaining = (size: string) => Math.max(0, getAssigned(size) - getPicked(size) + getRejected(size));

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
    const merged: Record<string, number> = { ...pickedBySize };
    Object.keys(addBySize).forEach(size => {
      merged[size] = Number(merged[size] || 0) + Number(addBySize[size] || 0);
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
          const newPicked = Number(getPicked(sizeName) + Number(addBySize[sizeName] || 0));
          await (supabase as any)
            .from('order_batch_size_distributions')
            .upsert({
              order_batch_assignment_id: assignmentId,
              size_name: sizeName,
              quantity: getAssigned(sizeName),
              picked_quantity: newPicked
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
            {(sizeDistributions || []).map((s) => {
              const assigned = getAssigned(s.size_name);
              const picked = getPicked(s.size_name);
              const rejected = getRejected(s.size_name);
              const remaining = Math.max(0, assigned - picked + rejected);
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
                    {rejected > 0 && <span>• Rejected {rejected}</span>}
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


