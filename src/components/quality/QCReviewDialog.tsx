import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";

interface SizeRow { size_name: string; picked: number; approved: number; rejected: number; remarks?: string; }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  assignmentId: string;
}

export default function QCReviewDialog({ isOpen, onClose, orderId, orderNumber, assignmentId }: Props) {
  const [rows, setRows] = useState<SizeRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      // Load picked quantities by size
      const { data: sizes } = await (supabase as any)
        .from('order_batch_size_distributions')
        .select('size_name, picked_quantity')
        .eq('order_batch_assignment_id', assignmentId);
      // Load existing QC rows to see what's already verified
      const { data: qc } = await (supabase as any)
        .from('qc_reviews')
        .select('size_name, approved_quantity, rejected_quantity, remarks, picked_quantity')
        .eq('order_batch_assignment_id', assignmentId);
      
      const qcMap = new Map<string, { a: number; r: number; m?: string; pq: number }>();
      (qc || []).forEach((q: any) => qcMap.set(q.size_name, { 
        a: Number(q.approved_quantity || 0), 
        r: Number(q.rejected_quantity || 0), 
        m: q.remarks,
        pq: Number(q.picked_quantity || 0)
      }));
      
      // For each size, calculate items needing verification
      const base: SizeRow[] = (sizes || []).map((s: any) => {
        const currentPicked = Number(s.picked_quantity || 0);
        const qcData = qcMap.get(s.size_name);
        const previousApproved = qcData?.a || 0;
        const previousRejected = qcData?.r || 0;
        const previousPicked = qcData?.pq || 0;
        
        // Items needing verification = current picked - (previous approved + previous rejected)
        // This calculates how many NEW items need QC verification
        // Example: picked=10, approved=9, rejected=1 → needsQC = 10 - (9+1) = 0
        // But if picker picked 1 replacement after rejection:
        // picked stays 10, but (approved=9 + rejected=1) = 10, so needsQC = 0
        // However, we need to verify the 1 replacement!
        
        // Better approach: Items needing QC = currentPicked - (previousApproved + previousRejected)
        // But if there are rejected items, replacements should be verified
        // So: items needing QC = max(0, currentPicked - (previousApproved + previousRejected))
        // If currentPicked > previousApproved + previousRejected, there are new items
        
        let itemsNeedingQC = Math.max(0, currentPicked - (previousApproved + previousRejected));
        
        // If currentPicked equals previousApproved + previousRejected but there are rejected items,
        // it means replacements were picked (picked qty stayed same)
        // In this case, we should show the rejected qty for re-verification
        if (itemsNeedingQC === 0 && previousRejected > 0 && currentPicked === (previousApproved + previousRejected)) {
          // This means replacements were picked - show rejected count for re-verification
          itemsNeedingQC = previousRejected;
        }
        
        // If there's no QC data yet, all picked items need QC
        // If there's QC data, show items needing verification
        const needsQC = qcData ? itemsNeedingQC : currentPicked;
        
        return {
          size_name: s.size_name,
          picked: needsQC, // Show only items needing QC verification
          approved: 0, // Reset to 0 - will accumulate when saving
          rejected: 0, // Reset to 0 - will accumulate when saving
          remarks: qcData?.m || ''
        };
      });
      
      setRows(base);
    };
    if (isOpen) load();
  }, [isOpen, assignmentId]);

  const totals = useMemo(() => {
    return rows.reduce((acc, r) => {
      acc.picked += r.picked; acc.approved += r.approved; acc.rejected += r.rejected; return acc;
    }, { picked: 0, approved: 0, rejected: 0 });
  }, [rows]);

  const getRemainingFor = (r: SizeRow) => Math.max(0, r.picked - r.approved - r.rejected);
  const needsRemarks = rows.some(r => r.rejected > 0 && !(r.remarks || '').trim());

  const setApproved = (size: string, value: number) => {
    setRows(prev => prev.map(r => {
      if (r.size_name !== size) return r;
      let desiredApproved = Math.max(0, Number(value) || 0);
      if (desiredApproved > r.picked) desiredApproved = r.picked;
      const newRejected = Math.max(0, r.picked - desiredApproved);
      return { ...r, approved: desiredApproved, rejected: newRejected };
    }));
  };
  const setRejected = (size: string, value: number) => {
    setRows(prev => prev.map(r => {
      if (r.size_name !== size) return r;
      let desiredRejected = Math.max(0, Number(value) || 0);
      if (desiredRejected > r.picked) desiredRejected = r.picked;
      const newApproved = Math.max(0, r.picked - desiredRejected);
      return { ...r, rejected: desiredRejected, approved: newApproved };
    }));
  };
  const setRemarks = (size: string, value: string) => {
    setRows(prev => prev.map(r => r.size_name === size ? { ...r, remarks: value } : r));
  };

  const handleSave = async () => {
    // Guard: no row should exceed picked and remarks required when rejected > 0
    for (const r of rows) {
      if (r.approved + r.rejected > r.picked) return;
      if (r.rejected > 0 && !(r.remarks || '').trim()) return;
    }
    try {
      setSaving(true);
      
      // Get current picked quantities to calculate totals correctly
      const { data: sizes } = await (supabase as any)
        .from('order_batch_size_distributions')
        .select('size_name, picked_quantity')
        .eq('order_batch_assignment_id', assignmentId);
      const pickedMap = new Map<string, number>();
      (sizes || []).forEach((s: any) => {
        pickedMap.set(s.size_name, Number(s.picked_quantity || 0));
      });
      
      // Get existing QC data to accumulate
      const { data: existingQC } = await (supabase as any)
        .from('qc_reviews')
        .select('size_name, approved_quantity, rejected_quantity')
        .eq('order_batch_assignment_id', assignmentId);
      const existingQCMap = new Map<string, { a: number; r: number }>();
      (existingQC || []).forEach((q: any) => {
        existingQCMap.set(q.size_name, { 
          a: Number(q.approved_quantity || 0), 
          r: Number(q.rejected_quantity || 0) 
        });
      });
      
      // Upsert one row per size - accumulate approved/rejected totals
      await Promise.all(rows.map(async (r) => {
        const currentPicked = pickedMap.get(r.size_name) || 0;
        const existing = existingQCMap.get(r.size_name);
        const previousApproved = existing?.a || 0;
        const previousRejected = existing?.r || 0;
        
        // r.approved and r.rejected are the NEW approvals/rejections for items being verified in this session
        // The dialog shows only items needing verification, so r.approved/r.rejected are new values
        // Accumulate: total approved/rejected = previous + new
        const totalApproved = Math.max(0, previousApproved + r.approved);
        const totalRejected = Math.max(0, previousRejected + r.rejected);
        
        // Ensure totals don't exceed current picked quantity
        const finalApproved = Math.min(totalApproved, currentPicked);
        const finalRejected = Math.min(totalRejected, currentPicked - finalApproved);
        
        await (supabase as any)
          .from('qc_reviews')
          .upsert({
            order_batch_assignment_id: assignmentId,
            size_name: r.size_name,
            picked_quantity: currentPicked, // Current total picked quantity
            approved_quantity: finalApproved,
            rejected_quantity: finalRejected,
            remarks: r.remarks || null
          } as any, { onConflict: 'order_batch_assignment_id,size_name' } as any);
      }));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>QC for order {orderNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge className="bg-green-100 text-green-800">Picked: {totals.picked}</Badge>
            <Badge className="bg-blue-100 text-blue-800">Approved: {totals.approved}</Badge>
            <Badge className="bg-red-100 text-red-800">Rejected: {totals.rejected}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {rows.map(r => {
              const remaining = getRemainingFor(r);
              return (
                <div key={r.size_name} className="border rounded-lg p-3">
                  <div className="text-sm font-medium mb-1">{r.size_name}</div>
                  <div className="text-xs text-muted-foreground mb-2">Picked {r.picked} • Remaining {remaining}</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="text-xs">Approve</div>
                      <Input type="number" min={0} max={Math.max(0, r.picked - r.rejected)} value={r.approved} onChange={(e) => setApproved(r.size_name, Number(e.target.value || 0))} />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs">Reject</div>
                      <Input type="number" min={0} max={Math.max(0, r.picked - r.approved)} value={r.rejected} onChange={(e) => setRejected(r.size_name, Number(e.target.value || 0))} />
                    </div>
                  </div>
                  {r.rejected > 0 && (
                    <div className="mt-2">
                      <div className="text-xs mb-1">Remarks (required for rejection)</div>
                      <Textarea rows={2} placeholder="Reason for rejection..." value={r.remarks || ''} onChange={(e) => setRemarks(r.size_name, e.target.value)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || needsRemarks}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


