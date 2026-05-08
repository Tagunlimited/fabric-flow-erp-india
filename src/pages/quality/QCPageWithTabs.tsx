import { useEffect, useMemo, useState } from "react";
import { ErpLayout } from "@/components/ErpLayout";
import { usePersistentTabState } from "@/hooks/usePersistentTabState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import QCReviewDialog from "@/components/quality/QCReviewDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BackButton } from '@/components/common/BackButton';
import { getOrderItemListThumbnailUrl, getOrderCardPlaceholderSrc } from '@/utils/orderItemImageUtils';
import { sumAssignedFromSizeDistributions } from '@/utils/pickerRemaining';
import { orderNeedsQcVerification } from '@/utils/qcOrderFilters';

interface PickedOrderCard {
  order_id: string;
  order_number: string;
  customer_name?: string;
  picked_quantity: number; // sum across assignments
  total_quantity: number;  // sum across assignments
  image_url?: string;
  assignment_ids: string[];
  approved_quantity: number; // sum across assignments
  rejected_quantity: number; // sum across assignments
  is_fully_qc: boolean; // true if all assignments are fully QC'd
  qc_status: 'pending' | 'partial' | 'completed';
  /** Unique batch faces for stacked avatars */
  batch_faces?: Array<{ name: string; avatar?: string | null }>;
}

export default function QCPageWithTabs() {
  const [orders, setOrders] = useState<PickedOrderCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectAssignmentsForOrder, setSelectAssignmentsForOrder] = useState<null | { order_id: string; order_number: string; options: { assignment_id: string; batch_name?: string; picked: number; batch_leader_name?: string; batch_leader_avatar?: string | null }[] }>(null);
  const [qcOpen, setQcOpen] = useState(false);
  const [qcCtx, setQcCtx] = useState<null | { assignmentId: string; orderId: string; orderNumber: string }>(null);
  // Use persistent tab state to prevent resetting to first tab on refresh
  const { activeTab, setActiveTab } = usePersistentTabState({
    pageKey: 'qc',
    defaultValue: 'pending'
  });

  useEffect(() => {
    loadPickedOrders();
  }, []);

  const loadPickedOrders = async () => {
    setLoading(true);
    try {
      // Load all batch assignments with quantities and batch leader
      const { data: assignments } = await (supabase as any)
        .from('order_batch_assignments_with_details')
        .select(
          'assignment_id, order_id, total_quantity, batch_name, batch_leader_name, batch_leader_avatar, batch_leader_avatar_url, size_distributions'
        )
        .order('assignment_date', { ascending: false });

      const rows = assignments || [];
      if (rows.length === 0) { setOrders([]); return; }
      const assignmentIds = rows.map((r: any) => r.assignment_id).filter(Boolean);
      const orderIds = Array.from(new Set(rows.map((r: any) => r.order_id).filter(Boolean)));

      const assignmentAssignedById: Record<string, number> = {};
      rows.forEach((r: any) => {
        const id = String(r?.assignment_id || '').trim();
        if (!id) return;
        const viewTot = Number(r.total_quantity ?? 0) || 0;
        const fromDist = sumAssignedFromSizeDistributions(r?.size_distributions);
        assignmentAssignedById[id] = Math.max(viewTot, fromDist);
      });

      // Picked: sum size rows per assignment; do NOT add assignment notes on top (double-count breaks QC routing).
      let pickedByAssignment: Record<string, number> = {};
      let pickedFromNotes: Record<string, number> = {};
      if (assignmentIds.length > 0) {
        try {
          const { data: pickedRows } = await (supabase as any)
            .from('order_batch_size_distributions')
            .select('order_batch_assignment_id, picked_quantity')
            .in('order_batch_assignment_id', assignmentIds as any);
          (pickedRows || []).forEach((r: any) => {
            const id = r?.order_batch_assignment_id as string | undefined;
            if (!id) return;
            pickedByAssignment[id] = (pickedByAssignment[id] || 0) + Number(r.picked_quantity || 0);
          });
        } catch {}
        try {
          const { data: asn } = await (supabase as any)
            .from('order_batch_assignments')
            .select('id, notes')
            .in('id', assignmentIds as any);
          (asn || []).forEach((a: any) => {
            if (!a?.id || !a?.notes) return;
            try {
              const parsed = JSON.parse(a.notes);
              if (parsed && parsed.picked_by_size && typeof parsed.picked_by_size === 'object') {
                let sum = 0;
                for (const v of Object.values(parsed.picked_by_size as Record<string, any>)) sum += Number(v) || 0;
                pickedFromNotes[a.id] = sum;
              }
            } catch {}
          });
        } catch {}
      }
      assignmentIds.forEach((id: string) => {
        const col = pickedByAssignment[id] || 0;
        const note = pickedFromNotes[id] || 0;
        pickedByAssignment[id] = col > 0 ? col : note;
      });

      // QC approved/rejected by assignment - MORE DETAILED
      let approvedByAssignment: Record<string, number> = {};
      let rejectedByAssignment: Record<string, number> = {};
      let qcCompleteByAssignment: Record<string, boolean> = {};
      
      if (assignmentIds.length > 0) {
        try {
          const { data: qcRows } = await (supabase as any)
            .from('qc_reviews')
            .select('order_batch_assignment_id, approved_quantity, rejected_quantity, picked_quantity')
            .in('order_batch_assignment_id', assignmentIds as any);
          
          (qcRows || []).forEach((q: any) => {
            const id = q?.order_batch_assignment_id as string | undefined; 
            if (!id) return;
            approvedByAssignment[id] = (approvedByAssignment[id] || 0) + Number(q.approved_quantity || 0);
            rejectedByAssignment[id] = (rejectedByAssignment[id] || 0) + Number(q.rejected_quantity || 0);
          });
          
          // Done when bench is full, all assigned approved, and no open rejects (picker ↔ QC loop).
          assignmentIds.forEach((id: string) => {
            const picked = pickedByAssignment[id] || 0;
            const approved = approvedByAssignment[id] || 0;
            const rejected = rejectedByAssignment[id] || 0;
            const assigned = assignmentAssignedById[id] || 0;
            qcCompleteByAssignment[id] =
              assigned > 0 && picked >= assigned && approved >= assigned && rejected === 0;
          });
          
        } catch {}
      }

      // Fetch order and customer, and images (exclude readymade orders - they don't go through QC)
      let ordersMap: Record<string, { order_number?: string; customer_id?: string; order_type?: string | null }> = {};
      if (orderIds.length > 0) {
        const { data: orderRows } = await (supabase as any)
          .from('orders')
          .select('id, order_number, customer_id, order_type')
          .eq('is_deleted', false)
          .in('id', orderIds as any)
          .or('order_type.is.null,order_type.eq.custom'); // Exclude readymade orders
        (orderRows || []).forEach((o: any) => {
          ordersMap[o.id] = { order_number: o.order_number, customer_id: o.customer_id, order_type: o.order_type };
        });
      }
      const customerIds = Array.from(new Set(Object.values(ordersMap).map(o => o.customer_id).filter(Boolean)));
      let customersMap: Record<string, string> = {};
      if (customerIds.length > 0) {
        const { data: customers } = await (supabase as any)
          .from('customers')
          .select('id, company_name')
          .in('id', customerIds as any);
        (customers || []).forEach((c: any) => { customersMap[c.id] = c.company_name; });
      }
      let imageByOrder: Record<string, string | undefined> = {};
      try {
        const { data: boms } = await (supabase as any)
          .from('bom_records')
          .select('order_id, product_image_url')
          .eq('is_deleted', false)
          .in('order_id', orderIds as any);
        (boms || []).forEach((b: any) => { if (b?.order_id && b?.product_image_url) imageByOrder[b.order_id] = b.product_image_url; });
      } catch {}
      try {
        const { data: items } = await (supabase as any)
          .from('order_items')
          .select('order_id, category_image_url, mockup_images, specifications')
          .eq('is_deleted', false)
          .in('order_id', orderIds as any);
        (items || []).forEach((it: any) => {
          const oid = it?.order_id; if (!oid) return;
          if (!imageByOrder[oid]) {
            const orderMeta = ordersMap[oid];
            const thumb = getOrderItemListThumbnailUrl(it, { order_type: orderMeta?.order_type ?? undefined });
            if (thumb) imageByOrder[oid] = thumb;
          }
        });
      } catch {}

      // Aggregate by order to avoid duplicates, summing totals and picked; also keep assignment ids
      const byOrder: Record<string, PickedOrderCard> = {};
      const assignmentMeta: Record<string, { order_id: string; order_number: string; batch_name?: string; picked: number; batch_leader_name?: string; batch_leader_avatar?: string | null }> = {};
      
      rows.forEach((r: any) => {
        const picked = Number(pickedByAssignment[r.assignment_id] || 0);
        if (picked <= 0) return; // exclude not picked
        const oid = r.order_id as string;
        const key = oid;
        if (!byOrder[key]) {
          byOrder[key] = {
            order_id: oid,
            order_number: ordersMap[oid]?.order_number || '',
            customer_name: customersMap[ordersMap[oid]?.customer_id || ''],
            picked_quantity: 0,
            total_quantity: 0,
            image_url: imageByOrder[oid],
            assignment_ids: [],
            approved_quantity: 0,
            rejected_quantity: 0,
            is_fully_qc: true,
            qc_status: 'pending',
            batch_faces: [],
          };
        }
        byOrder[key].picked_quantity += picked;
        const lineAssigned =
          assignmentAssignedById[String(r.assignment_id)] ??
          Math.max(Number(r.total_quantity || 0), sumAssignedFromSizeDistributions(r.size_distributions));
        byOrder[key].total_quantity += lineAssigned;
        byOrder[key].approved_quantity += Number(approvedByAssignment[r.assignment_id] || 0);
        byOrder[key].rejected_quantity += Number(rejectedByAssignment[r.assignment_id] || 0);
        byOrder[key].assignment_ids.push(r.assignment_id);
        
        // Check if this assignment is fully QC'd
        const isThisAssignmentComplete = qcCompleteByAssignment[r.assignment_id] || false;
        if (!isThisAssignmentComplete) {
          byOrder[key].is_fully_qc = false;
        }
        
        assignmentMeta[r.assignment_id] = {
          order_id: oid,
          order_number: byOrder[key].order_number,
          batch_name: r.batch_name,
          picked,
          batch_leader_name: r.batch_leader_name,
          batch_leader_avatar: r.batch_leader_avatar_url || r.batch_leader_avatar,
        };
        const faceName = String(r.batch_leader_name || '').trim();
        const faceUrl = r.batch_leader_avatar_url || r.batch_leader_avatar || null;
        if (faceName && byOrder[key].batch_faces) {
          const seen = new Set(byOrder[key].batch_faces!.map((f) => f.name.toLowerCase()));
          if (!seen.has(faceName.toLowerCase())) {
            byOrder[key].batch_faces!.push({ name: faceName, avatar: faceUrl });
          }
        }
      });

      // Determine QC status for each order
      Object.values(byOrder).forEach(order => {
        if (order.is_fully_qc) {
          order.qc_status = 'completed';
        } else if (order.approved_quantity > 0 || order.rejected_quantity > 0) {
          order.qc_status = 'partial';
        } else {
          order.qc_status = 'pending';
        }
      });

      const pickedOrders: PickedOrderCard[] = Object.values(byOrder);
      // store meta on window for quick lookup in this session (avoid prop drilling)
      (window as any).__qcAssignmentMeta = assignmentMeta;
      setOrders(pickedOrders);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let filteredOrders = orders;
    
    if (activeTab === 'pending') {
      filteredOrders = orders.filter(
        (o) =>
          !o.is_fully_qc &&
          (orderNeedsQcVerification(o) || o.qc_status === 'pending')
      );
    } else if (activeTab === 'partial') {
      filteredOrders = orders.filter(
        (o) =>
          !o.is_fully_qc &&
          !orderNeedsQcVerification(o) &&
          o.qc_status !== 'pending'
      );
    } else if (activeTab === 'completed') {
      filteredOrders = orders.filter(o => o.qc_status === 'completed');
    }
    
    // Apply search filter
    if (q) {
      filteredOrders = filteredOrders.filter(o => 
        o.order_number.toLowerCase().includes(q) || 
        (o.customer_name || '').toLowerCase().includes(q)
      );
    }
    
    return filteredOrders;
  }, [orders, search, activeTab]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />;
      case 'partial': return <Clock className="h-4 w-4 shrink-0 text-amber-600" />;
      case 'pending': return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />;
      default: return <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'border-emerald-200/90 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-100';
      case 'partial': return 'border-amber-200/90 bg-amber-50 text-amber-950 dark:bg-amber-950/35 dark:text-amber-100';
      case 'pending': return 'border-amber-200/90 bg-amber-50/90 text-amber-950 dark:bg-amber-950/35 dark:text-amber-100';
      default: return 'border-border bg-muted/50 text-foreground';
    }
  };

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div className="flex items-center">
          <BackButton to="/quality" label="Back to Quality" />
        </div>
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">QC</h1>
          <p className="text-muted-foreground mt-1">Review and QC picked orders</p>
        </div>

        <div className="flex items-center gap-3 max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search orders or customers" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pending" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              QC review ({orders.filter(o => !o.is_fully_qc && (orderNeedsQcVerification(o) || o.qc_status === 'pending')).length})
            </TabsTrigger>
            <TabsTrigger value="partial" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Rework / pick ({orders.filter(o => !o.is_fully_qc && !orderNeedsQcVerification(o) && o.qc_status !== 'pending').length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Completed ({orders.filter(o => o.qc_status === 'completed').length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="space-y-4">
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground">
                No {activeTab} orders found.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((o) => (
                  <Card
                    key={o.order_id}
                    className={`group overflow-hidden border border-border/80 bg-card/80 backdrop-blur-sm shadow-sm transition hover:shadow-lg hover:border-primary/25 ${o.qc_status === 'completed' ? 'opacity-[0.92]' : ''}`}
                    onClick={() => {
                    if (o.qc_status === 'completed') return;
                    const meta = (window as any).__qcAssignmentMeta as Record<string, { order_id: string; order_number: string; batch_name?: string; picked: number; batch_leader_name?: string; batch_leader_avatar?: string | null }>;
                    const options = o.assignment_ids.map(id => ({ assignment_id: id, batch_name: meta?.[id]?.batch_name, picked: meta?.[id]?.picked || 0, batch_leader_name: meta?.[id]?.batch_leader_name, batch_leader_avatar: meta?.[id]?.batch_leader_avatar }));
                    if (options.length <= 1) {
                      const chosen = options[0];
                      setQcCtx({ assignmentId: chosen.assignment_id, orderId: o.order_id, orderNumber: o.order_number });
                      setQcOpen(true);
                    } else {
                      setSelectAssignmentsForOrder({ order_id: o.order_id, order_number: o.order_number, options });
                    }
                  }}
                  >
                    <CardContent className="p-0">
                      <div className="flex gap-0">
                        <div className="relative w-[96px] shrink-0 self-stretch min-h-[120px] bg-muted/40">
                          <img
                            src={o.image_url || getOrderCardPlaceholderSrc()}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-transparent to-transparent" />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                                #{o.order_number}
                                <span aria-hidden>{getStatusIcon(o.qc_status)}</span>
                              </div>
                              <p className="truncate text-xs text-muted-foreground">{o.customer_name || '—'}</p>
                              <Badge className={`mt-2 h-6 rounded-full px-2.5 text-[11px] font-medium ${getStatusColor(o.qc_status)}`}>
                                {o.qc_status === 'partial' ? 'In progress' : o.qc_status.charAt(0).toUpperCase() + o.qc_status.slice(1)}
                              </Badge>
                            </div>
                            {(o.batch_faces && o.batch_faces.length > 0) && (
                              <div className="flex shrink-0 -space-x-2 pt-0.5">
                                {o.batch_faces.slice(0, 4).map((f, idx) => (
                                  <Avatar key={`${f.name}-${idx}`} className="h-8 w-8 border-2 border-background ring-1 ring-border/80">
                                    <AvatarImage src={f.avatar || undefined} alt="" />
                                    <AvatarFallback className="bg-primary/15 text-[10px] font-medium text-primary">
                                      {f.name.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                            {[
                              { label: 'Total', val: o.total_quantity, tint: 'bg-violet-500/10 text-violet-800 dark:text-violet-200' },
                              { label: 'Picked', val: o.picked_quantity, tint: 'bg-amber-500/10 text-amber-900 dark:text-amber-200' },
                              { label: 'OK', val: o.approved_quantity, tint: 'bg-emerald-500/10 text-emerald-900 dark:text-emerald-200' },
                              { label: 'Rejected', val: o.rejected_quantity, tint: 'bg-rose-500/10 text-rose-900 dark:text-rose-200' },
                            ].map((s) => (
                              <div key={s.label} className={`rounded-lg px-2.5 py-2 text-center ${s.tint}`}>
                                <div className="text-[10px] font-medium uppercase tracking-wider opacity-80">{s.label}</div>
                                <div className="text-lg font-semibold tabular-nums leading-tight">{Math.round(Number(s.val) || 0)}</div>
                              </div>
                            ))}
                          </div>
                          {o.qc_status === 'completed' && (
                            <div className="rounded-md border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-1.5 text-[11px] text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                              ✓ QC complete — every batch disposition recorded
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Choose batch to QC when multiple assignments exist */}
        <Dialog open={!!selectAssignmentsForOrder} onOpenChange={(v) => { if (!v) setSelectAssignmentsForOrder(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Choose batch for order {(selectAssignmentsForOrder?.order_number) || ''}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {selectAssignmentsForOrder?.options.map(opt => (
                <Card key={opt.assignment_id} className="border hover:shadow-md transition cursor-pointer" onClick={() => {
                  setSelectAssignmentsForOrder(null);
                  setQcCtx({ assignmentId: opt.assignment_id, orderId: selectAssignmentsForOrder!.order_id, orderNumber: selectAssignmentsForOrder!.order_number });
                  setQcOpen(true);
                }}>
                  <CardContent className="pt-4 pb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={opt.batch_leader_avatar || undefined} />
                        <AvatarFallback>{(opt.batch_leader_name || 'B')[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-sm">{opt.batch_name || 'Batch'}</div>
                        <div className="text-xs text-muted-foreground">{opt.batch_leader_name || 'Manager'}</div>
                      </div>
                    </div>
                    <Badge className="bg-green-100 text-green-800">Picked: {opt.picked}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* QC Dialog */}
        {qcOpen && qcCtx && (
          <QCReviewDialog
            isOpen={qcOpen}
            onClose={() => { setQcOpen(false); loadPickedOrders(); }}
            orderId={qcCtx.orderId}
            orderNumber={qcCtx.orderNumber}
            assignmentId={qcCtx.assignmentId}
          />
        )}
      </div>
    </ErpLayout>
  );
}
