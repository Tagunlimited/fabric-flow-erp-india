import { useEffect, useMemo, useState } from "react";
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Search, Users, Scissors } from "lucide-react";
import PickerQuantityDialog from "@/components/production/PickerQuantityDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface TailorListItem {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  tailor_type?: string | null;
  assigned_orders: number;
  assigned_quantity: number;
  picked_quantity: number;
  rejected_quantity?: number;
  batch_id?: string | null;
  is_batch_leader?: boolean | null;
}

export default function PickerPage() {
  const [tailors, setTailors] = useState<TailorListItem[]>([]);
  const [tailorSearch, setTailorSearch] = useState("");
  const [loadingTailors, setLoadingTailors] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [batchOrders, setBatchOrders] = useState<any[]>([]);
  const [loadingBatchOrders, setLoadingBatchOrders] = useState(false);
  const [ordersDialogOpen, setOrdersDialogOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerContext, setPickerContext] = useState<{
    assignmentId: string;
    orderNumber: string;
    customerName?: string;
    sizeDistributions: { size_name: string; quantity: number }[];
  } | null>(null);
  const [rejectedOpen, setRejectedOpen] = useState(false);
  const [rejectedOrderNumber, setRejectedOrderNumber] = useState("");
  const [rejectedItems, setRejectedItems] = useState<{ size_name: string; rejected_quantity: number; remarks?: string }[]>([]);
  const [batchRejectedOpen, setBatchRejectedOpen] = useState(false);
  const [batchRejectedTitle, setBatchRejectedTitle] = useState("");
  const [batchRejectedDetails, setBatchRejectedDetails] = useState<{ order_number: string; sizes: { size_name: string; rejected_quantity: number; remarks?: string }[] }[]>([]);

  useEffect(() => {
    fetchTailorsWithAssignedCounts();
  }, []);

  // Removed aggressive focus and visibility refresh to prevent resetting user work

  const fetchTailorsWithAssignedCounts = async () => {
    setLoadingTailors(true);
    try {
      // Build batch-wise cards instead of tailors
      const { data: batches } = await (supabase as any)
        .from('batches')
        .select('id, batch_name, batch_code, tailor_type, status')
        .order('batch_name');

      const baseBatches = (batches || []).filter((b: any) => !b.status || b.status === 'active');
      const batchIds = baseBatches.map((b: any) => b.id).filter(Boolean);

      // Leaders
      let leaderByBatch: Record<string, { full_name?: string; avatar_url?: string }> = {};
      if (batchIds.length > 0) {
        try {
          const { data: leaders } = await (supabase as any)
            .from('tailors')
            .select('id, full_name, avatar_url, batch_id, is_batch_leader')
            .eq('is_batch_leader', true)
            .in('batch_id', batchIds as any);
          (leaders || []).forEach((t: any) => {
            if (t.batch_id) leaderByBatch[t.batch_id] = { full_name: t.full_name, avatar_url: t.avatar_url };
          });
        } catch {}
      }

      // Assigned orders and quantities per batch
      let ordersCountByBatch: Record<string, number> = {};
      let qtyByBatch: Record<string, number> = {};
      let pickedByBatch: Record<string, number> = {};
      let rejectedByBatch: Record<string, number> = {};
      let assignmentToBatch: Record<string, string> = {};
      let assignmentIds: string[] = [];
      if (batchIds.length > 0) {
        try {
          const { data: oba } = await (supabase as any)
            .from('order_batch_assignments_with_details')
            .select('assignment_id, batch_id, order_id, total_quantity')
            .in('batch_id', batchIds as any);
          const orderSet: Record<string, Set<string>> = {};
          (oba || []).forEach((row: any) => {
            const b = row?.batch_id as string | undefined;
            if (!b) return;
            qtyByBatch[b] = (qtyByBatch[b] || 0) + Number(row.total_quantity || 0);
            assignmentToBatch[row.assignment_id] = b;
            assignmentIds.push(row.assignment_id);
            const oid = row?.order_id as string | undefined;
            if (oid) {
              if (!orderSet[b]) orderSet[b] = new Set<string>();
              orderSet[b].add(oid);
            }
          });
          Object.keys(orderSet).forEach(b => { ordersCountByBatch[b] = orderSet[b].size; });
        } catch {}

        // Compute picked totals per batch from size distributions
        if (assignmentIds.length > 0) {
          try {
            const { data: pickedRows } = await (supabase as any)
              .from('order_batch_size_distributions')
              .select('order_batch_assignment_id, picked_quantity')
              .in('order_batch_assignment_id', assignmentIds as any);
            (pickedRows || []).forEach((r: any) => {
              const aid = r?.order_batch_assignment_id as string | undefined; if (!aid) return;
              const b = assignmentToBatch[aid]; if (!b) return;
              pickedByBatch[b] = (pickedByBatch[b] || 0) + Number(r.picked_quantity || 0);
            });
          } catch {}
          // Fallback: add picked from notes JSON if column not present/populated
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
                  let sum = 0; for (const v of Object.values(parsed.picked_by_size as Record<string, any>)) sum += Number(v) || 0;
                  const b = assignmentToBatch[a.id]; if (!b) return;
                  pickedByBatch[b] = (pickedByBatch[b] || 0) + sum;
                }
              } catch {}
            });
          } catch {}

          // QC rejections per batch
          try {
            const { data: qcRows } = await (supabase as any)
              .from('qc_reviews')
              .select('order_batch_assignment_id, rejected_quantity')
              .in('order_batch_assignment_id', assignmentIds as any);
            (qcRows || []).forEach((q: any) => {
              const aid = q?.order_batch_assignment_id as string | undefined; if (!aid) return;
              const b = assignmentToBatch[aid]; if (!b) return;
              rejectedByBatch[b] = (rejectedByBatch[b] || 0) + Number(q.rejected_quantity || 0);
            });
          } catch {}
        }
      }

      const list: TailorListItem[] = baseBatches.map((b: any) => ({
        id: b.id,
        full_name: b.batch_name,
        avatar_url: leaderByBatch[b.id]?.avatar_url,
        tailor_type: b.tailor_type,
        assigned_orders: ordersCountByBatch[b.id] || 0,
        assigned_quantity: qtyByBatch[b.id] || 0,
        picked_quantity: Math.max(0, (pickedByBatch[b.id] || 0) - (rejectedByBatch[b.id] || 0)),
        rejected_quantity: rejectedByBatch[b.id] || 0,
        batch_id: b.id,
        is_batch_leader: true,
      }));

      setTailors(list);
    } catch (e) {
      setTailors([]);
    } finally {
      setLoadingTailors(false);
    }
  };

  const openBatchRejectedDetails = async (batchId: string, batchName: string) => {
    try {
      const { data: rows } = await (supabase as any)
        .from('order_batch_assignments_with_details')
        .select('assignment_id, order_id')
        .eq('batch_id', batchId);
      const aids = (rows || []).map((r: any) => r.assignment_id).filter(Boolean);
      const orderIds = Array.from(new Set((rows || []).map((r: any) => r.order_id).filter(Boolean)));
      let ordersMap: Record<string, string> = {};
      if (orderIds.length > 0) {
        const { data: ords } = await (supabase as any)
          .from('orders')
          .select('id, order_number')
          .in('id', orderIds as any);
        (ords || []).forEach((o: any) => { ordersMap[o.id] = o.order_number; });
      }
      const { data: qcRows } = await (supabase as any)
        .from('qc_reviews')
        .select('order_batch_assignment_id, size_name, rejected_quantity, remarks')
        .in('order_batch_assignment_id', aids as any);
      // Need mapping assignment -> order_id
      const aidToOrder: Record<string, string> = {};
      (rows || []).forEach((r: any) => { if (r.assignment_id) aidToOrder[r.assignment_id] = r.order_id; });
      const perOrder: Record<string, Record<string, { size_name: string; rejected_quantity: number; remarks?: string }>> = {};
      (qcRows || []).forEach((q: any) => {
        const oid = aidToOrder[q.order_batch_assignment_id]; if (!oid) return;
        if (!perOrder[oid]) perOrder[oid] = {};
        const key = q.size_name as string;
        const prev = perOrder[oid][key]?.rejected_quantity || 0;
        perOrder[oid][key] = { size_name: key, rejected_quantity: prev + Number(q.rejected_quantity || 0), remarks: q.remarks || undefined };
      });
      const details = Object.entries(perOrder).map(([oid, map]) => ({ order_number: ordersMap[oid] || oid, sizes: Object.values(map) }));
      setBatchRejectedDetails(details);
      setBatchRejectedTitle(batchName);
      setBatchRejectedOpen(true);
    } catch {}
  };

  const openBatchOrders = async (batchId: string) => {
    setActiveBatchId(batchId);
    setLoadingBatchOrders(true);
    try {
      const { data: rows } = await (supabase as any)
        .from('order_batch_assignments_with_details')
        .select('assignment_id, order_id, assignment_date, total_quantity, size_distributions, batch_name')
        .eq('batch_id', batchId)
        .order('assignment_date', { ascending: false });

      const assignmentIds = Array.from(new Set((rows || []).map((r: any) => r.assignment_id).filter(Boolean)));

      // Picked totals: try size_distributions.picked_quantity first, then notes JSON fallback
      let pickedByAssignment: Record<string, number> = {};
      let rejectedByAssignment: Record<string, number> = {};
      let rejectedSizesByAssignment: Record<string, { size_name: string; rejected_quantity: number; remarks?: string }[]> = {};
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
                const sum: number = Object.values(parsed.picked_by_size as Record<string, any>).reduce((acc, v: any) => acc + (Number(v) || 0), 0);
                pickedByAssignment[a.id] = (pickedByAssignment[a.id] || 0) + sum;
              }
            } catch {}
          });
        } catch {}

        // Load QC rejections per size
        try {
          const { data: qcRows } = await (supabase as any)
            .from('qc_reviews')
            .select('order_batch_assignment_id, size_name, rejected_quantity, remarks')
            .in('order_batch_assignment_id', assignmentIds as any);
          const perAid: Record<string, Record<string, { size_name: string; rejected_quantity: number; remarks?: string }>> = {};
          (qcRows || []).forEach((q: any) => {
            const aid = q?.order_batch_assignment_id as string | undefined; if (!aid) return;
            rejectedByAssignment[aid] = (rejectedByAssignment[aid] || 0) + Number(q.rejected_quantity || 0);
            if (!perAid[aid]) perAid[aid] = {};
            const key = q.size_name as string;
            const prev = perAid[aid][key]?.rejected_quantity || 0;
            perAid[aid][key] = { size_name: key, rejected_quantity: prev + Number(q.rejected_quantity || 0), remarks: q.remarks || undefined };
          });
          rejectedSizesByAssignment = Object.fromEntries(Object.entries(perAid).map(([aid, map]) => [aid, Object.values(map)]));
        } catch {}
      }

      const orderIds = Array.from(new Set((rows || []).map((r: any) => r.order_id).filter(Boolean)));
      let ordersMap: Record<string, { order_number?: string; customer_id?: string }> = {};
      if (orderIds.length > 0) {
        const { data: orders } = await (supabase as any)
          .from('orders')
          .select('id, order_number, customer_id')
          .in('id', orderIds as any);
        (orders || []).forEach((o: any) => { ordersMap[o.id] = { order_number: o.order_number, customer_id: o.customer_id }; });
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

      const enriched = (rows || []).map((r: any) => ({
        assignment_id: r.assignment_id,
        order_id: r.order_id,
        order_number: ordersMap[r.order_id]?.order_number,
        customer_name: customersMap[ordersMap[r.order_id]?.customer_id || ''],
        assignment_date: r.assignment_date,
        total_quantity: Number(r.total_quantity || 0),
        picked_quantity: Number(pickedByAssignment[r.assignment_id] || 0),
        rejected_quantity: Number(rejectedByAssignment[r.assignment_id] || 0),
        rejected_sizes: rejectedSizesByAssignment[r.assignment_id] || [],
        size_distributions: Array.isArray(r.size_distributions) ? r.size_distributions : [],
      }));
      const pending = enriched.filter((o: any) => {
        const effectivePicked = Math.max(0, Number(o.picked_quantity || 0) - Number(o.rejected_quantity || 0));
        return Number(o.total_quantity || 0) > effectivePicked;
      });
      setBatchOrders(pending);
      setOrdersDialogOpen(true);
    } catch (e) {
      setBatchOrders([]);
      setOrdersDialogOpen(true);
    } finally {
      setLoadingBatchOrders(false);
    }
  };

  const openPickerForAssignment = (assignment: any) => {
    setPickerContext({
      assignmentId: assignment.assignment_id,
      orderNumber: assignment.order_number,
      customerName: assignment.customer_name,
      sizeDistributions: assignment.size_distributions || [],
    });
    setPickerOpen(true);
  };

  const filteredTailors = useMemo(() => {
    const q = tailorSearch.trim().toLowerCase();
    if (!q) return tailors;
    return tailors.filter(t => t.full_name.toLowerCase().includes(q));
  }, [tailorSearch, tailors]);

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Picker
          </h1>
          <p className="text-muted-foreground mt-1">
            Assignments overview by tailor and by order
          </p>
        </div>

        <Tabs defaultValue="tailors" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="tailors" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Batch view
            </TabsTrigger>
             
          </TabsList>

          <TabsContent value="tailors" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Tailors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search tailors..."
                      value={tailorSearch}
                      onChange={(e) => setTailorSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {loadingTailors ? (
                  <p className="text-muted-foreground">Loading tailors...</p>
                ) : filteredTailors.length === 0 ? (
                  <p className="text-muted-foreground">No tailors found.</p>
                ) : (
                  <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredTailors.map((t) => (
                      <Card key={t.id} className="border shadow-erp-md cursor-pointer hover:shadow-lg transition" onClick={() => openBatchOrders(t.id)}>
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-4">
                            <Avatar className="h-12 w-12">
                              <AvatarImage src={t.avatar_url || undefined} alt={t.full_name} />
                              <AvatarFallback>{t.full_name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="space-y-1">
                              <div className="font-semibold">{t.full_name}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Scissors className="w-3.5 h-3.5" />
                                {t.tailor_type ? String(t.tailor_type).replace(/_/g, ' ') : 'Tailor'}
                              </div>
                            </div>
                          </div>
                          <div className="mt-4">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className="bg-blue-100 text-blue-800">
                                Assigned Orders: {t.assigned_orders}
                              </Badge>
                              {t.assigned_quantity > 0 && (
                                <Badge className="bg-purple-100 text-purple-800">
                                  Assigned Qty: {t.assigned_quantity}
                                </Badge>
                              )}
                              {t.picked_quantity > 0 && (
                                <Badge className="bg-green-100 text-green-800">
                                  Picked Qty: {t.picked_quantity}
                                </Badge>
                              )}
                              {t.rejected_quantity && t.rejected_quantity > 0 && (
                                <Badge className="bg-red-100 text-red-800" onClick={(e) => { e.stopPropagation(); openBatchRejectedDetails(t.id, t.full_name); }}>
                                  Rejected Qty: {t.rejected_quantity}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {activeBatchId && (
                    <div className="mt-6 space-y-3">
                      <div className="text-sm font-medium">Orders for selected batch</div>
                      {loadingBatchOrders ? (
                        <p className="text-muted-foreground">Loading...</p>
                      ) : batchOrders.length === 0 ? (
                        <p className="text-muted-foreground">No pending orders for this batch.</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {batchOrders.map((o) => (
                            <Card key={o.assignment_id} className="border hover:shadow-md transition cursor-pointer" onClick={() => openPickerForAssignment(o)}>
                              <CardContent className="pt-5">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-semibold">Order #{o.order_number}</div>
                                    <div className="text-xs text-muted-foreground">{o.customer_name}</div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge className="bg-purple-100 text-purple-800">Qty: {o.total_quantity}</Badge>
                                    <Badge className="bg-green-100 text-green-800">Picked: {o.picked_quantity}</Badge>
                                    {o.rejected_quantity > 0 && (
                                      <Badge className="bg-red-100 text-red-800" onClick={(e) => { e.stopPropagation(); setRejectedOrderNumber(o.order_number); setRejectedItems(o.rejected_sizes || []); setRejectedOpen(true); }}>Rejected: {o.rejected_quantity}</Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="mt-2 text-xs text-muted-foreground">
                                  {Array.isArray(o.size_distributions) && o.size_distributions.length > 0 ? (
                                    <span>Sizes: {o.size_distributions.map((sd: any) => `${sd.size_name}:${sd.quantity}`).join(', ')}</span>
                                  ) : (
                                    <span>No sizes</span>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
           
        </Tabs>
        {/* Orders list dialog per batch */}
        <Dialog open={ordersDialogOpen} onOpenChange={(v) => { if (!v) { setOrdersDialogOpen(false); fetchTailorsWithAssignedCounts(); } }}>
          <DialogContent className="max-w-6xl">
            <DialogHeader>
              <DialogTitle>Orders for selected batch</DialogTitle>
            </DialogHeader>
            {loadingBatchOrders ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : batchOrders.length === 0 ? (
              <p className="text-muted-foreground">No pending orders for this batch.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {batchOrders.map((o) => (
                  <Card key={o.assignment_id} className="border hover:shadow-md transition cursor-pointer" onClick={() => { setOrdersDialogOpen(false); openPickerForAssignment(o); }}>
                    <CardContent className="pt-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">Order #{o.order_number}</div>
                          <div className="text-xs text-muted-foreground">{o.customer_name}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-purple-100 text-purple-800">Qty: {o.total_quantity}</Badge>
                          <Badge className="bg-green-100 text-green-800">Picked: {o.picked_quantity}</Badge>
                          {o.rejected_quantity > 0 && (
                            <Badge className="bg-red-100 text-red-800" onClick={(e) => { e.stopPropagation(); setRejectedOrderNumber(o.order_number); setRejectedItems(o.rejected_sizes || []); setRejectedOpen(true); }}>Rejected: {o.rejected_quantity}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {Array.isArray(o.size_distributions) && o.size_distributions.length > 0 ? (
                          <span>Sizes: {o.size_distributions.map((sd: any) => `${sd.size_name}:${sd.quantity}`).join(', ')}</span>
                        ) : (
                          <span>No sizes</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Rejected sizes dialog */}
        <Dialog open={rejectedOpen} onOpenChange={(v) => { if (!v) setRejectedOpen(false); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Rejected sizes for order {rejectedOrderNumber}</DialogTitle>
            </DialogHeader>
            {rejectedItems.length === 0 ? (
              <p className="text-muted-foreground">No rejections recorded.</p>
            ) : (
              <div className="space-y-2">
                {rejectedItems.map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between border rounded p-2">
                    <div>
                      <div className="text-sm font-medium">{it.size_name}</div>
                      {it.remarks && <div className="text-xs text-muted-foreground">{it.remarks}</div>}
                    </div>
                    <Badge className="bg-red-100 text-red-800">{it.rejected_quantity}</Badge>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Batch-level rejected details dialog */}
        <Dialog open={batchRejectedOpen} onOpenChange={(v) => { if (!v) setBatchRejectedOpen(false); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Rejected details for {batchRejectedTitle}</DialogTitle>
            </DialogHeader>
            {batchRejectedDetails.length === 0 ? (
              <p className="text-muted-foreground">No rejections recorded.</p>
            ) : (
              <div className="space-y-3">
                {batchRejectedDetails.map((od, i) => (
                  <div key={i} className="border rounded p-2">
                    <div className="text-sm font-medium mb-1">Order #{od.order_number}</div>
                    <div className="space-y-1">
                      {od.sizes.map((s, j) => (
                        <div key={j} className="flex items-center justify-between">
                          <div className="text-xs text-muted-foreground">{s.size_name}{s.remarks ? ` • ${s.remarks}` : ''}</div>
                          <Badge className="bg-red-100 text-red-800">{s.rejected_quantity}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Picker dialog (size-wise picking) */}
        {pickerOpen && pickerContext && (
          <PickerQuantityDialog
            isOpen={pickerOpen}
            onClose={() => setPickerOpen(false)}
            onSuccess={() => {
              if (activeBatchId) openBatchOrders(activeBatchId);
              fetchTailorsWithAssignedCounts();
            }}
            assignmentId={pickerContext.assignmentId}
            orderNumber={pickerContext.orderNumber}
            customerName={pickerContext.customerName}
            sizeDistributions={pickerContext.sizeDistributions}
          />
        )}
      </div>
    </ErpLayout>
  );
}


