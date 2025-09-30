import { useEffect, useMemo, useState } from "react";
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground">No QC-approved orders found.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((o) => (
              <Card key={o.order_id} className="border hover:shadow-md transition">
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
      </div>
    </ErpLayout>
  );
}


