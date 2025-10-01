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
      const base: SizeRow[] = (sizes || []).map((s: any) => ({ size_name: s.size_name, picked: Number(s.picked_quantity || 0), approved: 0, rejected: 0, remarks: '' }));
      // Load existing QC rows
      const { data: qc } = await (supabase as any)
        .from('qc_reviews')
        .select('size_name, approved_quantity, rejected_quantity, remarks')
        .eq('order_batch_assignment_id', assignmentId);
      const map = new Map<string, { a: number; r: number; m?: string }>();
      (qc || []).forEach((q: any) => map.set(q.size_name, { a: Number(q.approved_quantity || 0), r: Number(q.rejected_quantity || 0), m: q.remarks }));
      setRows(base.map(b => ({ ...b, approved: map.get(b.size_name)?.a || 0, rejected: map.get(b.size_name)?.r || 0, remarks: map.get(b.size_name)?.m || '' })));
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
      const v = Math.max(0, Number(value) || 0);
      const maxAllowed = Math.max(0, r.picked - r.rejected);
      return { ...r, approved: Math.min(v, maxAllowed) };
    }));
  };
  const setRejected = (size: string, value: number) => {
    setRows(prev => prev.map(r => {
      if (r.size_name !== size) return r;
      const v = Math.max(0, Number(value) || 0);
      const maxAllowed = Math.max(0, r.picked - r.approved);
      return { ...r, rejected: Math.min(v, maxAllowed) };
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
      // Upsert one row per size
      await Promise.all(rows.map(async (r) => {
        await (supabase as any)
          .from('qc_reviews')
          .upsert({
            order_batch_assignment_id: assignmentId,
            size_name: r.size_name,
            picked_quantity: r.picked,
            approved_quantity: r.approved,
            rejected_quantity: r.rejected,
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


