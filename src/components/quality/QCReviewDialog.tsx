import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { useSizeTypes } from "@/hooks/useSizeTypes";
import { sortSizeDistributionsByMasterOrder } from "@/utils/sizeSorting";
import { getOrderItemDisplayImage } from "@/utils/orderItemImageUtils";
import { toast } from "sonner";

interface SizeRow { size_name: string; picked: number; approved: number; rejected: number; remarks?: string; }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  assignmentId: string;
}

export default function QCReviewDialog({ isOpen, onClose, orderId, orderNumber, assignmentId }: Props) {
  const { sizeTypes } = useSizeTypes();
  const [rows, setRows] = useState<SizeRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [productImage, setProductImage] = useState<string | null>(null);

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
      
      // Get size_type_id and product image from order items
      let sizeTypeId: string | null = null;
      let orderItemData: any = null;
      try {
        const { data: orderItems } = await (supabase as any)
          .from('order_items')
          .select('size_type_id, specifications, category_image_url, mockup_images')
          .eq('order_id', orderId)
          .limit(1);
        if (orderItems && orderItems.length > 0) {
          orderItemData = orderItems[0];
          if (orderItemData.size_type_id) {
            sizeTypeId = orderItemData.size_type_id;
          }
          
          // Get product image using utility
          const imageUrl = getOrderItemDisplayImage(orderItemData);
          setProductImage(imageUrl);
        }
      } catch (error) {
        console.error('Error fetching order item data:', error);
      }
      
      // Items still needing QC = physical picked minus already-approved (good) units.
      // Rejected units were removed from picked_quantity when QC saved — do NOT subtract rejected here
      // or replacement picks never show (e.g. picked 60, approved 55, rejected 5 → after refill picked 60,
      // old formula 60-(55+5)=0 blocks second QC pass).
      const base: SizeRow[] = (sizes || []).map((s: any) => {
        const currentPicked = Number(s.picked_quantity || 0);
        const qcData = qcMap.get(s.size_name);
        const previousApproved = qcData?.a || 0;

        const itemsNeedingQC = Math.max(0, currentPicked - previousApproved);
        const needsQC = qcData ? itemsNeedingQC : currentPicked;

        return {
          size_name: s.size_name,
          picked: needsQC,
          approved: 0,
          rejected: 0,
          remarks: qcData?.m || ''
        };
      });

      const pendingOnly = base.filter((r) => r.picked > 0);
      const sortedRows = sortSizeDistributionsByMasterOrder(pendingOnly, sizeTypeId, sizeTypes);
      setRows(sortedRows);
    };
    if (isOpen) load();
  }, [isOpen, assignmentId, orderId, sizeTypes]);

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
      // r.approved and r.rejected are the NEW approvals/rejections for items being verified in this session
      // We need to add these to the previous totals to get cumulative approved/rejected
      await Promise.all(rows.map(async (r) => {
        const currentPicked = pickedMap.get(r.size_name) || 0;
        const existing = existingQCMap.get(r.size_name);
        const previousApproved = existing?.a || 0;
        const previousRejected = existing?.r || 0;
        
        // Accumulate: total approved/rejected = previous + new
        // r.approved and r.rejected represent approvals/rejections for the items shown in this dialog
        // (which are the NEW picks that need QC)
        // IMPORTANT: rejected_quantity is cumulative - it includes both old rejections and new rejections
        // We should NOT reduce rejected_quantity when approving new picks. It's historical data.
        const totalApproved = Math.max(0, previousApproved + r.approved);
        const totalRejected = Math.max(0, previousRejected + r.rejected);
        
        // Validation: approved + rejected should equal the items that were QC'd in this session
        // The items shown in dialog (r.picked) should equal r.approved + r.rejected
        // And total should not exceed current picked quantity
        const itemsQCDInThisSession = r.approved + r.rejected;
        if (itemsQCDInThisSession > r.picked) {
          console.warn(`QC validation failed for ${r.size_name}: QC'd ${itemsQCDInThisSession} but only ${r.picked} items shown`);
        }
        
        // Ensure cumulative totals are valid
        // Key insight: After replacements are picked and approved, approved can equal currentPicked
        // Rejected quantity is historical - it represents items that were rejected at some point
        // After replacement, the rejected items are replaced, but we keep the rejected count as historical data
        // So: approved can be up to currentPicked, and rejected is historical (doesn't have to fit within currentPicked)
        
        // Final approved: should not exceed current picked quantity
        const finalApproved = Math.min(totalApproved, currentPicked);
        
        // Final rejected: preserve historical rejected count, but ensure it doesn't cause inconsistency
        // If approved + rejected > currentPicked, it means replacements were picked and approved
        // In this case, approved should equal currentPicked, and rejected is just historical data
        let finalRejected = totalRejected;
        
        // Validate: The current picked items (after replacements) should be fully accounted for
        // If finalApproved + finalRejected > currentPicked, it means:
        // - Some items were rejected (historical)
        // - Replacements were picked (making picked = currentPicked)
        // - Replacements were approved (making approved = currentPicked)
        // This is valid - rejected is historical, approved is current state
        // But we should ensure approved doesn't exceed currentPicked
        let effectiveApproved = finalApproved;
        if (finalApproved > currentPicked) {
          console.warn(`QC validation: approved ${finalApproved} exceeds picked ${currentPicked} for ${r.size_name}, adjusting`);
          effectiveApproved = currentPicked;
        }

        const pickedAfterReject = Math.max(0, currentPicked - (r.rejected || 0));

        await (supabase as any)
          .from('qc_reviews')
          .upsert({
            order_batch_assignment_id: assignmentId,
            size_name: r.size_name,
            picked_quantity: pickedAfterReject,
            approved_quantity: effectiveApproved,
            rejected_quantity: finalRejected,
            remarks: r.remarks || null
          } as any, { onConflict: 'order_batch_assignment_id,size_name' } as any);

        // Rejected units leave the bench — reduce picked count so picker can replenish without increasing assigned total.
        if ((r.rejected || 0) > 0) {
          await (supabase as any)
            .from('order_batch_size_distributions')
            .update({
              picked_quantity: pickedAfterReject,
              updated_at: new Date().toISOString(),
            } as any)
            .eq('order_batch_assignment_id', assignmentId)
            .eq('size_name', r.size_name);
        }
      }));
      toast.success("QC saved", {
        description:
          rows.some((x) => (x.rejected || 0) > 0)
            ? "Rejected units sent back to picker. Order status set to rework when applicable."
            : "Units approved. Order moves forward when all assignments are fully approved.",
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>QC for order {orderNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge className="bg-green-100 text-green-800">Picked: {totals.picked}</Badge>
            <Badge className="bg-blue-100 text-blue-800">Approved: {totals.approved}</Badge>
            <Badge className="bg-red-100 text-red-800">Rejected: {totals.rejected}</Badge>
          </div>
          
          {/* Two-column layout: Image on left, sizes on right */}
          <div className="flex flex-col md:flex-row gap-6">
            {/* Left side: Product Image */}
            {productImage && (
              <div className="flex-shrink-0 w-full md:w-[300px]">
                <div className="rounded-xl overflow-hidden aspect-[3/4] relative" style={{ background: 'linear-gradient(to bottom, rgb(239 246 255) 40%, rgb(241 245 249) 40%)' }}>
                  <div className="absolute inset-0 flex items-center justify-center p-4">
                    <img
                      src={productImage}
                      alt={orderNumber}
                      className="max-h-full max-w-full object-contain"
                      onError={(e) => { 
                        (e.target as HTMLImageElement).style.display = 'none'; 
                        setProductImage(null);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
            
            {/* Right side: Size inputs */}
            <div className="flex-1 min-w-0">
              {rows.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
                  No units waiting for QC on this batch. If you just picked replacements after a rejection, refresh the list
                  and open again — you should see counts here once picked totals update.
                </div>
              ) : null}
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
            </div>
          </div>
          
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || needsRemarks || rows.length === 0}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


