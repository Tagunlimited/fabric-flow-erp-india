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
        .select('assignment_id, order_id, total_quantity, batch_name, batch_leader_name, batch_leader_avatar')
        .order('assignment_date', { ascending: false });

      const rows = assignments || [];
      if (rows.length === 0) { setOrders([]); return; }
      const assignmentIds = rows.map((r: any) => r.assignment_id).filter(Boolean);
      const orderIds = Array.from(new Set(rows.map((r: any) => r.order_id).filter(Boolean)));

      // Sum picked by assignment (column first, notes fallback)
      let pickedByAssignment: Record<string, number> = {};
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
                pickedByAssignment[a.id] = (pickedByAssignment[a.id] || 0) + sum;
              }
            } catch {}
          });
        } catch {}
      }

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
          
          // Check if QC is complete for each assignment
          assignmentIds.forEach((id: string) => {
            const picked = pickedByAssignment[id] || 0;
            const approved = approvedByAssignment[id] || 0;
            const rejected = rejectedByAssignment[id] || 0;
            
            // QC is complete if approved + rejected = picked (and picked > 0)
            qcCompleteByAssignment[id] = picked > 0 && (approved + rejected) === picked;
          });
          
        } catch {}
      }

      // Fetch order and customer, and images (exclude readymade orders - they don't go through QC)
      let ordersMap: Record<string, { order_number?: string; customer_id?: string }> = {};
      if (orderIds.length > 0) {
        const { data: orderRows } = await (supabase as any)
          .from('orders')
          .select('id, order_number, customer_id')
          .in('id', orderIds as any)
          .or('order_type.is.null,order_type.eq.custom'); // Exclude readymade orders
        (orderRows || []).forEach((o: any) => { ordersMap[o.id] = { order_number: o.order_number, customer_id: o.customer_id }; });
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
            qc_status: 'pending'
          };
        }
        byOrder[key].picked_quantity += picked;
        byOrder[key].total_quantity += Number(r.total_quantity || 0);
        byOrder[key].approved_quantity += Number(approvedByAssignment[r.assignment_id] || 0);
        byOrder[key].rejected_quantity += Number(rejectedByAssignment[r.assignment_id] || 0);
        byOrder[key].assignment_ids.push(r.assignment_id);
        
        // Check if this assignment is fully QC'd
        const isThisAssignmentComplete = qcCompleteByAssignment[r.assignment_id] || false;
        if (!isThisAssignmentComplete) {
          byOrder[key].is_fully_qc = false;
        }
        
        assignmentMeta[r.assignment_id] = { order_id: oid, order_number: byOrder[key].order_number, batch_name: r.batch_name, picked, batch_leader_name: r.batch_leader_name, batch_leader_avatar: r.batch_leader_avatar };
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
    
    // Filter by QC status based on active tab
    if (activeTab === 'pending') {
      filteredOrders = orders.filter(o => o.qc_status === 'pending');
    } else if (activeTab === 'partial') {
      filteredOrders = orders.filter(o => o.qc_status === 'partial');
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
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'partial': return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'pending': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default: return <AlertTriangle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'partial': return 'bg-yellow-100 text-yellow-800';
      case 'pending': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <ErpLayout>
      <div className="space-y-6">
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
              Pending ({orders.filter(o => o.qc_status === 'pending').length})
            </TabsTrigger>
            <TabsTrigger value="partial" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              In Progress ({orders.filter(o => o.qc_status === 'partial').length})
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((o) => (
                  <Card key={o.order_id} className={`border hover:shadow-md transition cursor-pointer ${o.qc_status === 'completed' ? 'opacity-75' : ''}`} onClick={() => {
                    // Only allow QC for non-completed orders
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
                  }}>
                    <CardContent className="pt-7">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <img src={o.image_url || '/placeholder.svg'} alt={o.order_number} className="w-12 h-12 rounded object-cover border" />
                          <div>
                            <div className="font-semibold flex items-center gap-2">
                              Order #{o.order_number}
                              {getStatusIcon(o.qc_status)}
                            </div>
                            <div className="text-xs text-muted-foreground">{o.customer_name}</div>
                            <Badge className={`text-xs mt-1 ${getStatusColor(o.qc_status)}`}>
                              {o.qc_status.charAt(0).toUpperCase() + o.qc_status.slice(1)}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-wrap justify-end">
                          <Badge className="bg-green-100 text-green-800">Picked: {o.picked_quantity}</Badge>
                          <Badge className="bg-blue-100 text-blue-800">Approved: {o.approved_quantity}</Badge>
                          <Badge className="bg-red-100 text-red-800">Rejected: {o.rejected_quantity}</Badge>
                          <Badge className="bg-purple-100 text-purple-800">Total: {o.total_quantity}</Badge>
                        </div>
                      </div>
                      {o.qc_status === 'completed' && (
                        <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                          ✓ QC Completed - All batches reviewed
                        </div>
                      )}
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
