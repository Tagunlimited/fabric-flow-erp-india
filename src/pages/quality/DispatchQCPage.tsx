import { useEffect, useMemo, useState } from "react";
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface OrderCard {
  order_id: string;
  order_number: string;
  customer_name?: string;
  approved_quantity: number;
  total_quantity: number;
  picked_quantity: number;
  image_url?: string;
}

export default function DispatchQCPage() {
  const [orders, setOrders] = useState<OrderCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("pending");

  // Dispatch modal state
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchTarget, setDispatchTarget] = useState<{ order_id: string; order_number: string; customer_name?: string } | null>(null);
  const [courierName, setCourierName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [dispatchNote, setDispatchNote] = useState("");
  const [savingDispatch, setSavingDispatch] = useState(false);
  const [dispatchQtyBySize, setDispatchQtyBySize] = useState<Record<string, number>>({});
  const [dispatchOrderId, setDispatchOrderId] = useState<string | null>(null);

  useEffect(() => { loadApprovedOrders(); }, []);

  const loadApprovedOrders = async () => {
    setLoading(true);
    try {
      // Load assignments (for totals/picked) and QC reviews for approvals
      const { data: asn } = await (supabase as any)
        .from('order_batch_assignments_with_details')
        .select('assignment_id, order_id, total_quantity')
        .order('assignment_date', { ascending: false });
      const rows = asn || [];
      if (rows.length === 0) { setOrders([]); return; }
      const assignmentIds = rows.map((r: any) => r.assignment_id).filter(Boolean);
      const orderIds = Array.from(new Set(rows.map((r: any) => r.order_id).filter(Boolean)));

      // Picked per assignment (column then notes)
      let pickedByAssignment: Record<string, number> = {};
      if (assignmentIds.length > 0) {
        try {
          const { data } = await (supabase as any)
            .from('order_batch_size_distributions')
            .select('order_batch_assignment_id, picked_quantity')
            .in('order_batch_assignment_id', assignmentIds as any);
          (data || []).forEach((r: any) => {
            const id = r?.order_batch_assignment_id as string | undefined; if (!id) return;
            pickedByAssignment[id] = (pickedByAssignment[id] || 0) + Number(r.picked_quantity || 0);
          });
        } catch {}
        try {
          const { data } = await (supabase as any)
            .from('order_batch_assignments')
            .select('id, notes')
            .in('id', assignmentIds as any);
          (data || []).forEach((a: any) => {
            if (!a?.id || !a?.notes) return;
            try {
              const parsed = JSON.parse(a.notes);
              if (parsed && parsed.picked_by_size && typeof parsed.picked_by_size === 'object') {
                let sum = 0; for (const v of Object.values(parsed.picked_by_size as Record<string, any>)) sum += Number(v) || 0;
                pickedByAssignment[a.id] = (pickedByAssignment[a.id] || 0) + sum;
              }
            } catch {}
          });
        } catch {}
      }

      // Approved per assignment
      let approvedByAssignment: Record<string, number> = {};
      if (assignmentIds.length > 0) {
        try {
          const { data: qcs } = await (supabase as any)
            .from('qc_reviews')
            .select('order_batch_assignment_id, approved_quantity')
            .in('order_batch_assignment_id', assignmentIds as any);
          (qcs || []).forEach((q: any) => {
            const id = q?.order_batch_assignment_id as string | undefined; if (!id) return;
            approvedByAssignment[id] = (approvedByAssignment[id] || 0) + Number(q.approved_quantity || 0);
          });
        } catch {}
      }

      // order details and images
      let ordersMap: Record<string, { order_number?: string; customer_id?: string }> = {};
      if (orderIds.length > 0) {
        const { data: ords } = await (supabase as any)
          .from('orders')
          .select('id, order_number, customer_id')
          .in('id', orderIds as any);
        (ords || []).forEach((o: any) => { ordersMap[o.id] = { order_number: o.order_number, customer_id: o.customer_id }; });
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
          .in('order_id', orderIds as any);
        (boms || []).forEach((b: any) => { if (b?.order_id && b?.product_image_url) imageByOrder[b.order_id] = b.product_image_url; });
      } catch {}
      try {
        const { data: items } = await (supabase as any)
          .from('order_items')
          .select('order_id, category_image_url, mockup_images')
          .in('order_id', orderIds as any);
        (items || []).forEach((it: any) => {
          const oid = it?.order_id; if (!oid) return;
          if (!imageByOrder[oid]) {
            const mock = Array.isArray(it?.mockup_images) && it.mockup_images.length > 0 ? it.mockup_images[0] : undefined;
            imageByOrder[oid] = it?.category_image_url || mock || imageByOrder[oid];
          }
        });
      } catch {}

      // Aggregate per order: only show with approved > 0
      const byOrder: Record<string, OrderCard> = {};
      rows.forEach((r: any) => {
        const aid = r.assignment_id as string;
        const approved = Number(approvedByAssignment[aid] || 0);
        if (approved <= 0) return;
        const oid = r.order_id as string;
        if (!byOrder[oid]) {
          byOrder[oid] = {
            order_id: oid,
            order_number: ordersMap[oid]?.order_number || '',
            customer_name: customersMap[ordersMap[oid]?.customer_id || ''],
            approved_quantity: 0,
            total_quantity: 0,
            picked_quantity: 0,
            image_url: imageByOrder[oid]
          };
        }
        byOrder[oid].approved_quantity += approved;
        byOrder[oid].total_quantity += Number(r.total_quantity || 0);
        byOrder[oid].picked_quantity += Number(pickedByAssignment[aid] || 0);
      });

      setOrders(Object.values(byOrder));
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(o => o.order_number.toLowerCase().includes(q) || (o.customer_name || '').toLowerCase().includes(q));
  }, [orders, search]);

  const totals = useMemo(() => {
    return filtered.reduce((acc, o) => {
      acc.approved += Number(o.approved_quantity || 0);
      acc.picked += Number(o.picked_quantity || 0);
      acc.total += Number(o.total_quantity || 0);
      return acc;
    }, { approved: 0, picked: 0, total: 0 });
  }, [filtered]);

  // Completed dispatch orders
  const [completed, setCompleted] = useState<any[]>([]);
  useEffect(() => {
    const fetchCompleted = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('dispatch_orders')
          .select(`
            id,
            order_id,
            dispatch_number,
            dispatch_date,
            status,
            courier_name,
            tracking_number,
            actual_delivery,
            orders:orders ( order_number, customers:customers ( company_name ) )
          `)
          .in('status', ['shipped','delivered'] as any)
          .order('dispatch_date', { ascending: false });
        if (!error) setCompleted(data || []);
      } catch {}
    };
    fetchCompleted();
  }, []);

  const [sizeRows, setSizeRows] = useState<Array<{ size_name: string; approved: number; dispatched: number; to_dispatch: number }>>([]);
  const openDispatchDialog = async (o: OrderCard) => {
    setDispatchTarget({ order_id: o.order_id, order_number: o.order_number, customer_name: o.customer_name });
    setCourierName("");
    setTrackingNumber("");
    setDispatchNote("");
    setDispatchOrderId(null);
    // Load per-size approved and already dispatched
    try {
      // Approved by size from qc_reviews
      const { data: qc } = await (supabase as any)
        .from('qc_reviews')
        .select('size_name, approved_quantity, order_batch_assignment_id')
        .in('order_batch_assignment_id', (
          await (supabase as any)
            .from('order_batch_assignments')
            .select('id')
            .eq('order_id', o.order_id)
        ).data?.map((r: any) => r.id) || []);
      const approvedMap: Record<string, number> = {};
      (qc || []).forEach((r: any) => {
        const k = r.size_name as string; approvedMap[k] = (approvedMap[k] || 0) + Number(r.approved_quantity || 0);
      });
      // Dispatched by size
      const { data: disp } = await (supabase as any)
        .from('dispatch_order_items')
        .select('size_name, quantity')
        .eq('order_id', o.order_id);
      const dispatchedMap: Record<string, number> = {};
      (disp || []).forEach((r: any) => {
        const k = r.size_name as string; dispatchedMap[k] = (dispatchedMap[k] || 0) + Number(r.quantity || 0);
      });
      const sizes = Array.from(new Set([...Object.keys(approvedMap), ...Object.keys(dispatchedMap)])).sort();
      const rows = sizes.map(size => {
        const approved = Number(approvedMap[size] || 0);
        const dispatched = Number(dispatchedMap[size] || 0);
        const to_dispatch = Math.max(0, approved - dispatched);
        return { size_name: size, approved, dispatched, to_dispatch };
      }).filter(r => r.to_dispatch > 0);
      setSizeRows(rows);
      // Pre-fill dispatch quantities with remaining to dispatch so Generate Challan works immediately
      const prefill: Record<string, number> = {};
      rows.forEach(r => { prefill[r.size_name] = Number(r.to_dispatch || 0); });
      setDispatchQtyBySize(prefill);
    } catch {
      setSizeRows([]);
    }
    setDispatchOpen(true);
  };

  const handleGenerateChallan = async () => {
    if (!dispatchTarget) return;
    // Require at least one qty > 0
    const totalToSend = Object.values(dispatchQtyBySize).reduce((a, b) => a + Number(b || 0), 0);
    if (totalToSend <= 0) return;
    try {
      setSavingDispatch(true);
      const dispatchNumber = `DSP-${Date.now()}`;
      // Resolve delivery address (orders.delivery_address fallback to customer full address)
      let deliveryAddress = '-';
      try {
        const { data: ord } = await (supabase as any)
          .from('orders')
          .select('delivery_address, customers:customers(address, city, state, pincode)')
          .eq('id', dispatchTarget.order_id)
          .maybeSingle();
        const customerAddr = [
          ord?.customers?.address,
          ord?.customers?.city,
          ord?.customers?.state,
          ord?.customers?.pincode
        ].filter(Boolean).join(', ');
        deliveryAddress = (ord?.delivery_address || customerAddr || '-') as string;
      } catch {}
      // Create challan (pending dispatch order)
      const { data: insData, error: insErr } = await (supabase as any)
        .from('dispatch_orders')
        .insert({
          order_id: dispatchTarget.order_id,
          dispatch_number: dispatchNumber,
          status: 'pending',
          courier_name: courierName || null,
          tracking_number: trackingNumber || null,
          delivery_address: deliveryAddress
        } as any)
        .select('id')
        .single();
      if (insErr) throw insErr;
      const newId = insData?.id as string;
      // Insert dispatch items per size
      const lines = Object.entries(dispatchQtyBySize)
        .filter(([, qty]) => Number(qty || 0) > 0)
        .map(([sizeName, qty]) => ({
          dispatch_order_id: newId,
          order_id: dispatchTarget.order_id,
          size_name: sizeName,
          quantity: Number(qty || 0)
        }));
      if (lines.length > 0) {
        await (supabase as any).from('dispatch_order_items').insert(lines as any);
      }
      setDispatchOrderId(newId);
      // Open challan for printing
      try { window.open(`/dispatch/challan/${newId}`, '_blank'); } catch {}
      // keep dialog open; user can print challan and then dispatch
    } finally {
      setSavingDispatch(false);
    }
  };

  const handleMarkDispatch = async () => {
    if (!dispatchTarget) return;
    if (!dispatchOrderId) return; // require challan first
    try {
      setSavingDispatch(true);
      // Update dispatch order to shipped and set latest courier/tracking
      await (supabase as any)
        .from('dispatch_orders')
        .update({ status: 'shipped', courier_name: courierName || null, tracking_number: trackingNumber || null } as any)
        .eq('id', dispatchOrderId);

      // Update order status to 'dispatched' (enum value must exist)
      try {
        // Compute newly dispatched total vs approved to decide partial/full
        const { data: totals } = await (supabase as any)
          .from('qc_reviews')
          .select('approved_quantity, order_batch_assignment_id')
          .in('order_batch_assignment_id', (
            await (supabase as any).from('order_batch_assignments').select('id').eq('order_id', dispatchTarget.order_id)
          ).data?.map((r: any) => r.id) || []);
        const approvedTotal = (totals || []).reduce((acc: number, r: any) => acc + Number(r.approved_quantity || 0), 0);
        const { data: dispAgg } = await (supabase as any)
          .from('dispatch_order_items')
          .select('quantity')
          .eq('order_id', dispatchTarget.order_id);
        const dispatchedTotal = (dispAgg || []).reduce((acc: number, r: any) => acc + Number(r.quantity || 0), 0);
        const newStatus = dispatchedTotal >= Math.max(1, approvedTotal) ? 'dispatched' : 'partial_dispatched';
        await (supabase as any)
          .from('orders')
          .update({ status: newStatus } as any)
          .eq('id', dispatchTarget.order_id);
      } catch {}

      // Log activity with note
      try {
        await (supabase as any).rpc('log_custom_order_activity', {
          p_order_id: dispatchTarget.order_id,
          p_activity_type: 'order_dispatched',
          p_activity_description: `Order dispatched${courierName ? ` via ${courierName}` : ''}${trackingNumber ? ` (Tracking: ${trackingNumber})` : ''}`,
          p_metadata: { note: dispatchNote || null, courier_name: courierName || null, tracking_number: trackingNumber || null }
        });
      } catch {}

      // Refresh lists
      await loadApprovedOrders();
      // Refresh completed tab
      try {
        const { data } = await (supabase as any)
          .from('dispatch_orders')
          .select(`id, order_id, dispatch_number, dispatch_date, status, courier_name, tracking_number, actual_delivery, orders:orders ( order_number, customers:customers ( company_name ) )`)
          .in('status', ['shipped','delivered'] as any)
          .order('dispatch_date', { ascending: false });
        setCompleted(data || []);
      } catch {}

      setDispatchOpen(false);
      setDispatchTarget(null);
    } catch {
      // no-op simple error handling here
    } finally {
      setSavingDispatch(false);
    }
  };

  const incDispatch = (size: string, delta: number, maxAllowed: number) => {
    setDispatchQtyBySize(prev => {
      const next = { ...prev };
      const curr = Number(next[size] || 0);
      const v = Math.max(0, Math.min(maxAllowed, curr + delta));
      next[size] = v;
      return next;
    });
  };
  const setDispatchDirect = (size: string, value: number, maxAllowed: number) => {
    setDispatchQtyBySize(prev => ({ ...prev, [size]: Math.max(0, Math.min(maxAllowed, Number(value) || 0)) }));
  };

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">Dispatch</h1>
          <p className="text-muted-foreground mt-1">Orders approved by QC, ready for dispatch</p>
        </div>

        <div className="flex items-center gap-3 max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search orders or customers" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {/* Totals for all QC approved quantities in the list */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">QC Approved (All)</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-blue-700">{totals.approved}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Picked (All)</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-green-700">{totals.picked}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Assigned (All)</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-purple-700">{totals.total}</div></CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="completed">Dispatch Completed</TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground">No QC-approved orders found.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((o) => (
                  <Card key={o.order_id} className="border hover:shadow-md transition cursor-pointer" onClick={() => openDispatchDialog(o)}>
                    <CardContent className="pt-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <img src={o.image_url || '/placeholder.svg'} alt={o.order_number} className="w-12 h-12 rounded object-cover border" />
                          <div>
                            <div className="font-semibold">Order #{o.order_number}</div>
                            <div className="text-xs text-muted-foreground">{o.customer_name}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          <Badge className="bg-blue-100 text-blue-800">Approved: {o.approved_quantity}</Badge>
                          <Badge className="bg-green-100 text-green-800">Picked: {o.picked_quantity}</Badge>
                          <Badge className="bg-purple-100 text-purple-800">Total: {o.total_quantity}</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed">
            {completed.length === 0 ? (
              <p className="text-muted-foreground">No completed dispatch orders.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(completed || []).map((d: any) => (
                  <Card key={d.id} className="border hover:shadow-md transition">
                    <CardContent className="pt-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">Order #{d.orders?.order_number || '-'}</div>
                          <div className="text-xs text-muted-foreground">{d.orders?.customers?.company_name || '-'}</div>
                        </div>
                        <Badge className="bg-green-100 text-green-800 capitalize">{String(d.status).replace('_',' ')}</Badge>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        <div>Dispatch No: {d.dispatch_number}</div>
                        <div>Dispatch Date: {new Date(d.dispatch_date).toLocaleString()}</div>
                        {d.courier_name && <div>Courier: {d.courier_name}</div>}
                        {d.tracking_number && <div>Tracking: {d.tracking_number}</div>}
                        {d.actual_delivery && <div>Delivered: {new Date(d.actual_delivery).toLocaleString()}</div>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dispatch dialog */}
      <Dialog open={dispatchOpen} onOpenChange={(v) => { if (!v) { setDispatchOpen(false); setDispatchTarget(null); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Mark as Dispatched</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">Order #{dispatchTarget?.order_number} {dispatchTarget?.customer_name ? `• ${dispatchTarget.customer_name}` : ''}</div>
            <div className="border rounded p-3">
              <div className="text-xs font-medium mb-2">Remaining Pcs to Dispatch</div>
              {sizeRows.length === 0 ? (
                <div className="text-xs text-muted-foreground">No pending quantities to dispatch.</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {sizeRows.map((r, idx) => (
                    <div key={idx} className="border rounded p-2 text-center">
                      <div className="text-[11px] text-muted-foreground">{r.size_name}</div>
                      <div className="text-base font-semibold">{r.to_dispatch}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {sizeRows.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sizeRows.map((r, idx) => {
                  const maxAllowed = r.to_dispatch;
                  const val = Number(dispatchQtyBySize[r.size_name] || 0);
                  return (
                    <div key={idx} className="border rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium">Size {r.size_name}</div>
                        <div className="text-xs text-muted-foreground">Approved {r.approved} • Dispatched {r.dispatched}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => incDispatch(r.size_name, -1, maxAllowed)}>-</Button>
                        <Input type="number" className="w-20 text-center" value={val} min={0} max={maxAllowed}
                          onChange={(e) => setDispatchDirect(r.size_name, Number(e.target.value || 0), maxAllowed)} />
                        <Button type="button" variant="outline" size="sm" onClick={() => incDispatch(r.size_name, +1, maxAllowed)}>+</Button>
                        <div className="text-xs text-muted-foreground ml-auto">Max {maxAllowed}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div>
              <div className="text-xs mb-1">Courier Name (optional)</div>
              <Input value={courierName} onChange={(e) => setCourierName(e.target.value)} />
            </div>
            <div>
              <div className="text-xs mb-1">Tracking Number (optional)</div>
              <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
            </div>
            <div>
              <div className="text-xs mb-1">Note (optional)</div>
              <Textarea rows={3} value={dispatchNote} onChange={(e) => setDispatchNote(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setDispatchOpen(false); setDispatchTarget(null); }} disabled={savingDispatch}>Cancel</Button>
              {!dispatchOrderId ? (
                <Button onClick={handleGenerateChallan} disabled={savingDispatch}>Generate Challan</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => { if (dispatchOrderId) window.open(`/dispatch/challan/${dispatchOrderId}`, '_blank'); }}>View/Print Challan</Button>
                  <Button onClick={handleMarkDispatch} disabled={savingDispatch}>Mark Dispatched</Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ErpLayout>
  );
}


