import { useEffect, useMemo, useState } from "react";
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import "@/pages/OrdersPageViewSwitch.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSizeTypes } from "@/hooks/useSizeTypes";
import { playOrderStatusChangeSound } from '@/utils/orderStatusSound';
import {
  collectOrderItemThumbnails,
  firstThumbnail,
  mergeBomThumbnailsIntoMap,
} from '@/lib/orderItemThumbnails';
import {
  OrderMultiImagePanel,
  resolveOrderImageUrls,
} from '@/components/orders/OrderMultiImagePanel';
import { DispatchProductSection } from '@/components/dispatch/DispatchProductSection';
import {
  DISPATCH_LEGACY_BUCKET,
  dispatchLineKey,
  dispatchQtyFromExistingItems,
  describeDispatchOrderLine,
  loadDispatchProductBreakdown,
  prefillDispatchQtyFromProductLines,
  type DispatchProductLine,
  type DispatchQtyKey,
} from '@/lib/dispatchProductBreakdown';
import { loadOutsourceDispatchCandidates } from '@/lib/outsourceFulfillment';

interface OrderCard {
  order_id: string;
  order_number: string;
  customer_name?: string;
  approved_quantity: number;
  total_quantity: number;
  picked_quantity: number;
  dispatched_quantity?: number;
  image_url?: string;
  image_urls?: string[];
  product_count?: number;
  is_readymade?: boolean;
  is_outsource?: boolean;
  hasPendingChallan?: boolean;
  order_type?: string | null;
}

export default function DispatchQCPage() {
  const { sizeTypes } = useSizeTypes();
  const [orders, setOrders] = useState<OrderCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');

  // Dispatch modal state
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchTarget, setDispatchTarget] = useState<{
    order_id: string;
    order_number: string;
    customer_name?: string;
    image_url?: string;
    image_urls?: string[];
    is_readymade?: boolean;
    order_type?: string | null;
  } | null>(null);
  const [courierName, setCourierName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [dispatchNote, setDispatchNote] = useState("");
  const [savingDispatch, setSavingDispatch] = useState(false);
  const [dispatchQtyByLine, setDispatchQtyByLine] = useState<Record<DispatchQtyKey, number>>({});
  const [dispatchOrderId, setDispatchOrderId] = useState<string | null>(null);

  const getFinancialYear = (date: Date) => {
    const startYear = date.getMonth() < 3 ? date.getFullYear() - 1 : date.getFullYear();
    const endYearShort = String(startYear + 1).slice(-2);
    return `${startYear}-${endYearShort}`;
  };

  const generateDispatchNumber = async () => {
    const fy = getFinancialYear(new Date());
    const prefix = `TUC/${fy}/DC/`;
    // Include soft-deleted rows: UNIQUE still holds their dispatch_number, so skipping them reuses a taken number.
    // Use max numeric suffix (not latest created_at): highest sequence can belong to an older row.
    const { data, error } = await (supabase as any)
      .from('dispatch_orders')
      .select('dispatch_number')
      .ilike('dispatch_number', `${prefix}%`);
    if (error) throw error;
    const suffixRe = /\/(\d{1,})$/;
    let maxSeq = 0;
    for (const row of data || []) {
      const dn = row?.dispatch_number as string | undefined;
      if (!dn) continue;
      const m = dn.match(suffixRe);
      if (m) maxSeq = Math.max(maxSeq, Number.parseInt(m[1], 10));
    }
    const next = maxSeq + 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  };
  
  // Details modal state
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [dispatchItems, setDispatchItems] = useState<
    Array<{ size_name: string; quantity: number; order_item_id?: string | null; label?: string }>
  >([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

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
      const assignmentIds = rows.map((r: any) => r.assignment_id).filter(Boolean);
      const orderIds = Array.from(new Set(rows.map((r: any) => r.order_id).filter(Boolean)));

      // Picked per assignment (column then notes)
      let pickedByAssignment: Record<string, number> = {};
      if (assignmentIds.length > 0) {
        try {
          const { data } = await (supabase as any)
            .from('order_batch_size_distributions')
            .select('order_batch_assignment_id, picked_quantity')
            .eq('is_deleted', false)
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
            .eq('is_deleted', false)
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
      // Note: approved_quantity in qc_reviews is cumulative across all QC sessions
      // When QC approves replacement picks after rejection, they accumulate with previous approvals
      // So summing all approved_quantity gives us total approved quantity for dispatch
      let approvedByAssignment: Record<string, number> = {};
      if (assignmentIds.length > 0) {
        try {
          const { data: qcs } = await (supabase as any)
            .from('qc_reviews')
            .select('order_batch_assignment_id, approved_quantity')
            .eq('is_deleted', false)
            .in('order_batch_assignment_id', assignmentIds as any);
          (qcs || []).forEach((q: any) => {
            const id = q?.order_batch_assignment_id as string | undefined; if (!id) return;
            // Sum approved quantities (already cumulative per size, so this gives total approved)
            approvedByAssignment[id] = (approvedByAssignment[id] || 0) + Number(q.approved_quantity || 0);
          });
        } catch {}
      }

      // order details and images (exclude readymade orders - they have separate dispatch flow)
      let ordersMap: Record<string, { order_number?: string; customer_id?: string; order_type?: string | null }> = {};
      if (orderIds.length > 0) {
        const { data: ords } = await (supabase as any)
          .from('orders')
          .select('id, order_number, customer_id, order_type')
          .eq('is_deleted', false)
          .in('id', orderIds as any)
          .or('order_type.is.null,order_type.eq.custom'); // Exclude readymade orders
        (ords || []).forEach((o: any) => {
          ordersMap[o.id] = { order_number: o.order_number, customer_id: o.customer_id, order_type: o.order_type };
        });
      }

      // Fetch confirmed readymade orders for dispatch separately
      // Include orders that have challans (dispatch_orders) but are not yet shipped
      // We need to fetch orders with these statuses OR orders that have pending dispatch_orders
      const { data: readymadeOrdersData } = await (supabase as any)
        .from('orders')
        .select('id, order_number, customer_id, status, order_date, expected_delivery_date, customers:customers(company_name)')
        .eq('is_deleted', false)
        .eq('order_type', 'readymade')
        .in('status', ['confirmed', 'ready_for_dispatch', 'dispatched', 'partial_dispatched'] as any)
        .order('order_date', { ascending: false });
      
      let readymadeOrders: any[] = readymadeOrdersData || [];
      
      // Also fetch any readymade orders that have pending dispatch_orders (even if status doesn't match)
      // This ensures we catch orders that just had challans generated
      try {
        const { data: pendingDispatchOrders } = await (supabase as any)
          .from('dispatch_orders')
          .select('order_id')
          .eq('is_deleted', false)
          .in('status', ['pending', 'packed'] as any);
        if (pendingDispatchOrders && pendingDispatchOrders.length > 0) {
          const pendingOrderIds = (pendingDispatchOrders || [])
            .map((d: any) => d.order_id)
            .filter((id: any) => id);
          if (pendingOrderIds.length > 0) {
            const { data: additionalOrders } = await (supabase as any)
              .from('orders')
              .select('id, order_number, customer_id, status, order_date, expected_delivery_date, customers:customers(company_name)')
              .eq('is_deleted', false)
              .eq('order_type', 'readymade')
              .in('id', pendingOrderIds as any);
            if (additionalOrders && additionalOrders.length > 0) {
              // Merge with existing readymadeOrders, avoiding duplicates
              const existingIds = new Set(readymadeOrders.map((o: any) => o.id));
              const newOrders = (additionalOrders || []).filter((o: any) => !existingIds.has(o.id));
              if (newOrders.length > 0) {
                readymadeOrders.push(...newOrders);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching orders with pending challans:', error);
      }
      
      // Build customers map including readymade order customers
      const allCustomerIds = Array.from(new Set([
        ...Object.values(ordersMap).map(o => o.customer_id).filter(Boolean),
        ...(readymadeOrders || []).map((o: any) => o.customer_id).filter(Boolean)
      ]));
      let customersMap: Record<string, string> = {};
      if (allCustomerIds.length > 0) {
        const { data: customers } = await (supabase as any)
          .from('customers')
          .select('id, company_name')
          .in('id', allCustomerIds as any);
        (customers || []).forEach((c: any) => { customersMap[c.id] = c.company_name; });
      }
      let imagesByOrder: Record<string, string[]> = {};
      const allThumbOrderIds = Array.from(new Set([...orderIds, ...(readymadeOrders || []).map((o: any) => o.id)]));
      try {
        const thumbMeta: Record<string, { order_type?: string | null }> = {};
        Object.entries(ordersMap).forEach(([id, m]) => {
          thumbMeta[id] = { order_type: m.order_type ?? null };
        });
        (readymadeOrders || []).forEach((o: any) => {
          thumbMeta[o.id] = { order_type: 'readymade' };
        });
        imagesByOrder = await collectOrderItemThumbnails(allThumbOrderIds, thumbMeta);
        const { data: boms } = await (supabase as any)
          .from('bom_records')
          .select('order_id, product_image_url')
          .eq('is_deleted', false)
          .in('order_id', orderIds as any);
        imagesByOrder = mergeBomThumbnailsIntoMap(imagesByOrder, boms || []);
      } catch {}

      const itemCountByOrder: Record<string, number> = {};
      try {
        if (allThumbOrderIds.length > 0) {
          const { data: itemCounts } = await (supabase as any)
            .from('order_items')
            .select('order_id')
            .eq('is_deleted', false)
            .in('order_id', allThumbOrderIds as any);
          (itemCounts || []).forEach((it: any) => {
            const oid = it?.order_id;
            if (!oid) return;
            itemCountByOrder[oid] = (itemCountByOrder[oid] || 0) + 1;
          });
        }
      } catch {}

      // Get dispatched quantities per order
      let dispatchedByOrder: Record<string, number> = {};
      if (orderIds.length > 0) {
        try {
          const { data: disp } = await (supabase as any)
            .from('dispatch_order_items')
            .select('order_id, quantity')
            .eq('is_deleted', false)
            .in('order_id', orderIds as any);
          (disp || []).forEach((r: any) => {
            const oid = r.order_id as string;
            dispatchedByOrder[oid] = (dispatchedByOrder[oid] || 0) + Number(r.quantity || 0);
          });
        } catch {}
      }

      // Aggregate per order: only show with approved > 0 (for custom orders)
      const byOrder: Record<string, OrderCard & { dispatched_quantity: number }> = {};
      rows.forEach((r: any) => {
        const aid = r.assignment_id as string;
        const approved = Number(approvedByAssignment[aid] || 0);
        if (approved <= 0) return;
        const oid = r.order_id as string;
        if (!byOrder[oid]) {
          const urls = imagesByOrder[oid] || [];
          byOrder[oid] = {
            order_id: oid,
            order_number: ordersMap[oid]?.order_number || '',
            customer_name: customersMap[ordersMap[oid]?.customer_id || ''],
            approved_quantity: 0,
            total_quantity: 0,
            picked_quantity: 0,
            dispatched_quantity: dispatchedByOrder[oid] || 0,
            image_urls: urls,
            image_url: firstThumbnail(urls),
            product_count: itemCountByOrder[oid] || 0,
            order_type: ordersMap[oid]?.order_type ?? null,
          };
        }
        byOrder[oid].approved_quantity += approved;
        byOrder[oid].total_quantity += Number(r.total_quantity || 0);
        byOrder[oid].picked_quantity += Number(pickedByAssignment[aid] || 0);
      });

      // Add readymade orders to the list (they don't have batches/QC, so approved = total quantity)
      if (readymadeOrders && readymadeOrders.length > 0) {
        // Get dispatched quantities for readymade orders
        const readymadeIds = readymadeOrders.map((o: any) => o.id);
        let readymadeDispatched: Record<string, number> = {};
        if (readymadeIds.length > 0) {
          try {
            const { data: disp } = await (supabase as any)
              .from('dispatch_order_items')
              .select('order_id, quantity')
              .eq('is_deleted', false)
              .in('order_id', readymadeIds as any);
            (disp || []).forEach((r: any) => {
              const oid = r.order_id as string;
              readymadeDispatched[oid] = (readymadeDispatched[oid] || 0) + Number(r.quantity || 0);
            });
          } catch {}
        }

        // Get total quantities for readymade orders from order_items
        let readymadeQuantities: Record<string, number> = {};
        try {
          const { data: items } = await (supabase as any)
            .from('order_items')
            .select('order_id, quantity')
            .eq('is_deleted', false)
            .in('order_id', readymadeIds as any);
          (items || []).forEach((it: any) => {
            const oid = it.order_id as string;
            readymadeQuantities[oid] = (readymadeQuantities[oid] || 0) + Number(it.quantity || 0);
          });
        } catch {}

        // Check for pending dispatch_orders (challans) for readymade orders
        // This is critical: orders with pending challans must be shown so they can be marked as shipped
        let pendingChallans: Record<string, boolean> = {};
        if (readymadeIds.length > 0) {
          try {
            const { data: pendingDispatch } = await (supabase as any)
              .from('dispatch_orders')
              .select('order_id')
              .eq('is_deleted', false)
              .in('order_id', readymadeIds as any)
              .in('status', ['pending', 'packed'] as any);
            (pendingDispatch || []).forEach((d: any) => {
              if (d.order_id) pendingChallans[d.order_id] = true;
            });
          } catch (error) {
            console.error('Error checking for pending challans:', error);
          }
        }

        // Add readymade orders to byOrder
        // Include orders that have remaining quantity OR have a pending challan (not yet shipped)
        readymadeOrders.forEach((o: any) => {
          const totalQty = readymadeQuantities[o.id] || 0;
          const dispatchedQty = readymadeDispatched[o.id] || 0;
          const hasPendingChallan = pendingChallans[o.id] || false;
          
          // Show order if:
          // 1. Has total quantity > 0 AND
          // 2. Either has remaining quantity to dispatch OR has a pending challan that needs to be marked as shipped
          // IMPORTANT: Orders with pending challans MUST be shown even if dispatchedQty = totalQty
          // because the challan needs to be marked as "shipped"
          const hasRemaining = dispatchedQty < totalQty;
          const shouldShow = totalQty > 0 && (hasRemaining || hasPendingChallan);
          
          if (shouldShow) {
            const urls = imagesByOrder[o.id] || [];
            byOrder[o.id] = {
              order_id: o.id,
              order_number: o.order_number,
              customer_name: o.customers?.company_name || customersMap[o.customer_id] || '',
              approved_quantity: totalQty,
              total_quantity: totalQty,
              picked_quantity: totalQty,
              dispatched_quantity: dispatchedQty,
              image_urls: urls,
              image_url: firstThumbnail(urls),
              product_count: itemCountByOrder[o.id] || 0,
              is_readymade: true,
              hasPendingChallan: hasPendingChallan,
              order_type: 'readymade',
            };
          }
        });
      }

      try {
        const outsourceCandidates = await loadOutsourceDispatchCandidates();
        for (const oc of outsourceCandidates) {
          const oid = oc.order_id;
          const dispatchedQty =
            byOrder[oid]?.dispatched_quantity ?? dispatchedByOrder[oid] ?? 0;
          if (byOrder[oid]) {
            byOrder[oid].approved_quantity =
              Number(byOrder[oid].approved_quantity || 0) + oc.approved_quantity;
            byOrder[oid].is_outsource = true;
          } else {
            const urls = imagesByOrder[oid] || [];
            byOrder[oid] = {
              order_id: oid,
              order_number: oc.order_number,
              customer_name: oc.customer_name,
              approved_quantity: oc.approved_quantity,
              total_quantity: oc.approved_quantity,
              picked_quantity: oc.approved_quantity,
              dispatched_quantity: dispatchedQty,
              image_urls: urls,
              image_url: firstThumbnail(urls),
              product_count: itemCountByOrder[oid] || 0,
              is_outsource: true,
              order_type: oc.order_type ?? null,
            };
          }
        }
      } catch (error) {
        console.error('Error loading outsource dispatch candidates:', error);
      }

      setOrders(Object.values(byOrder));
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filteredOrders = q ? orders.filter(o => o.order_number.toLowerCase().includes(q) || (o.customer_name || '').toLowerCase().includes(q)) : orders;
    return filteredOrders;
  }, [orders, search]);

  // Separate orders with remaining quantity from those without
  const pendingOrders = useMemo(() => {
    return filtered.filter(o => {
      // Check if there's any remaining quantity to dispatch
      const remainingQuantity = o.approved_quantity - (o.dispatched_quantity || 0);
      // Also include orders with pending challans (they need to be marked as shipped)
      // IMPORTANT: Orders with pending challans should stay in pending tab until marked as shipped
      const hasPendingChallan = (o as any).hasPendingChallan || false;
      return remainingQuantity > 0 || hasPendingChallan;
    });
  }, [filtered]);

  const readyToDispatchOrders = useMemo(() => {
    return filtered.filter(o => {
      // Check if there's no remaining quantity to dispatch
      const remainingQuantity = o.approved_quantity - (o.dispatched_quantity || 0);
      // Exclude orders with pending challans (they should be in pending tab)
      const hasPendingChallan = (o as any).hasPendingChallan || false;
      return remainingQuantity <= 0 && !hasPendingChallan;
    });
  }, [filtered]);

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
          .eq('is_deleted', false)
          .in('status', ['shipped','delivered'] as any)
          .order('dispatch_date', { ascending: false });
        if (!error) setCompleted(data || []);
      } catch {}
    };
    fetchCompleted();
  }, []);

  const [productLines, setProductLines] = useState<DispatchProductLine[]>([]);
  const [isLegacyMerged, setIsLegacyMerged] = useState(false);
  const [isReadymadeOrder, setIsReadymadeOrder] = useState(false);

  const openDispatchDialog = async (o: OrderCard & { is_readymade?: boolean }) => {
    setDispatchTarget({
      order_id: o.order_id,
      order_number: o.order_number,
      customer_name: o.customer_name,
      image_url: o.image_url,
      image_urls: o.image_urls,
      is_readymade: o.is_readymade,
      order_type: o.order_type ?? null,
    });
    setCourierName("");
    setTrackingNumber("");
    setDispatchNote("");
    setDispatchOrderId(null);
    setDispatchQtyByLine({});
    setProductLines([]);
    setIsLegacyMerged(false);

    const isReadymade = Boolean(o.is_readymade);
    setIsReadymadeOrder(isReadymade);

    let existingDispatchId: string | null = null;
    try {
      const { data: existingDispatch } = await (supabase as any)
        .from('dispatch_orders')
        .select('id, courier_name, tracking_number, status')
        .eq('is_deleted', false)
        .eq('order_id', o.order_id)
        .in('status', ['pending', 'packed'] as any)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingDispatch) {
        existingDispatchId = existingDispatch.id;
        setDispatchOrderId(existingDispatch.id);
        setCourierName(existingDispatch.courier_name || '');
        setTrackingNumber(existingDispatch.tracking_number || '');
      }
    } catch (error) {
      console.error('Error checking for existing dispatch order:', error);
    }

    try {
      const { productLines: lines, isLegacyMerged: legacy } = await loadDispatchProductBreakdown(
        o.order_id,
        {
          isReadymade,
          orderType: o.order_type ?? (isReadymade ? 'readymade' : null),
          sizeTypes,
          includeZeroRemaining: Boolean(existingDispatchId),
        }
      );
      setProductLines(lines);
      setIsLegacyMerged(legacy);

      if (existingDispatchId) {
        const { data: existingItems } = await (supabase as any)
          .from('dispatch_order_items')
          .select('order_item_id, size_name, quantity')
          .eq('is_deleted', false)
          .eq('dispatch_order_id', existingDispatchId);
        setDispatchQtyByLine(dispatchQtyFromExistingItems(existingItems || []));
      } else {
        setDispatchQtyByLine(prefillDispatchQtyFromProductLines(lines));
      }
    } catch (error) {
      console.error('Error loading dispatch product breakdown:', error);
      setProductLines([]);
      setDispatchQtyByLine({});
    }

    setDispatchOpen(true);
  };

  const handleGenerateChallan = async () => {
    if (!dispatchTarget) return;
    // Require at least one qty > 0
    const totalToSend = Object.values(dispatchQtyByLine).reduce((a, b) => a + Number(b || 0), 0);
    if (totalToSend <= 0) return;
    try {
      setSavingDispatch(true);
      const dispatchNumber = await generateDispatchNumber();
      // Resolve delivery address (orders.delivery_address fallback to customer full address)
      let deliveryAddress = '-';
      try {
        const { data: ord } = await (supabase as any)
          .from('orders')
          .select('delivery_address, customers:customers(address, city, state, pincode)')
          .eq('is_deleted', false)
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
      // Create challan (pending dispatch order). Retry on unique race on dispatch_number.
      let newId: string | undefined;
      for (let attempt = 0; attempt < 8; attempt++) {
        const num =
          attempt === 0 ? dispatchNumber : await generateDispatchNumber();
        const { data: insData, error: insErr } = await (supabase as any)
          .from('dispatch_orders')
          .insert({
            order_id: dispatchTarget.order_id,
            dispatch_number: num,
            status: 'pending',
            courier_name: courierName || null,
            tracking_number: trackingNumber || null,
            delivery_address: deliveryAddress
          } as any)
          .select('id')
          .single();
        if (!insErr) {
          newId = insData?.id as string;
          break;
        }
        const isDup =
          insErr.code === '23505' &&
          String(insErr.message || '').includes('dispatch_number');
        if (!isDup || attempt === 7) throw insErr;
      }
      if (!newId) throw new Error('Could not allocate dispatch number');
      // Insert dispatch items per size
      const lines = Object.entries(dispatchQtyByLine)
        .filter(([, qty]) => Number(qty || 0) > 0)
        .map(([key, qty]) => {
          const sep = key.indexOf('::');
          const orderItemId = sep > 0 ? key.slice(0, sep) : DISPATCH_LEGACY_BUCKET;
          const sizeName = sep > 0 ? key.slice(sep + 2) : key;
          return {
            dispatch_order_id: newId,
            order_id: dispatchTarget.order_id,
            order_item_id: orderItemId === DISPATCH_LEGACY_BUCKET ? null : orderItemId,
            size_name: sizeName || 'Total',
            quantity: Number(qty || 0),
          };
        });
      if (lines.length > 0) {
        const { error: itemsError } = await (supabase as any).from('dispatch_order_items').insert(lines as any);
        if (itemsError) {
          console.error('Error inserting dispatch items:', itemsError);
          throw new Error(`Failed to save dispatch items: ${itemsError.message}`);
        }
      }
      setDispatchOrderId(newId);
      
      // Refresh orders list to update dispatched quantities
      await loadApprovedOrders();
      
      // Open challan for printing - use navigate with a small delay to ensure data is saved
      setTimeout(() => {
        try {
          const challanUrl = `/dispatch/challan/${newId}`;
          // Try window.open first, fallback to navigate if blocked
          const newWindow = window.open(challanUrl, '_blank');
          if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
            // Popup blocked, use navigate instead
            window.location.href = challanUrl;
          }
        } catch (error) {
          console.error('Error opening challan:', error);
          // Fallback: navigate to the challan page
          window.location.href = `/dispatch/challan/${newId}`;
        }
      }, 100);
      // keep dialog open; user can print challan and then dispatch
    } catch (error: any) {
      console.error('Error generating challan:', error);
      alert(`Failed to generate challan: ${error.message || 'Unknown error'}`);
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
        let approvedTotal = 0;
        let dispatchedTotal = 0;
        
        if (isReadymadeOrder) {
          // For readymade orders, get total from order_items
          const { data: items } = await (supabase as any)
            .from('order_items')
            .select('quantity')
            .eq('is_deleted', false)
            .eq('order_id', dispatchTarget.order_id);
          approvedTotal = (items || []).reduce((acc: number, r: any) => acc + Number(r.quantity || 0), 0);
        } else {
          // For custom orders, compute from QC reviews
          const { data: totals } = await (supabase as any)
            .from('qc_reviews')
            .select('approved_quantity, order_batch_assignment_id')
            .eq('is_deleted', false)
            .in('order_batch_assignment_id', (
              await (supabase as any).from('order_batch_assignments').select('id').eq('is_deleted', false).eq('order_id', dispatchTarget.order_id)
            ).data?.map((r: any) => r.id) || []);
          approvedTotal = (totals || []).reduce((acc: number, r: any) => acc + Number(r.approved_quantity || 0), 0);
        }
        
        const { data: dispAgg } = await (supabase as any)
          .from('dispatch_order_items')
          .select('quantity')
          .eq('is_deleted', false)
          .eq('order_id', dispatchTarget.order_id);
        dispatchedTotal = (dispAgg || []).reduce((acc: number, r: any) => acc + Number(r.quantity || 0), 0);
        
        // Determine status: if all items dispatched, mark as 'dispatched', otherwise 'partial_dispatched'
        const newStatus = dispatchedTotal >= Math.max(1, approvedTotal) ? 'dispatched' : 'partial_dispatched';
        
        // Update order status - for both custom and readymade orders
        const { error: orderStatusUpdateError } = await (supabase as any)
          .from('orders')
          .update({ status: newStatus } as any)
          .eq('id', dispatchTarget.order_id);
        if (!orderStatusUpdateError) {
          playOrderStatusChangeSound();
        }

        // For readymade orders, update product_master stock when dispatched
        if (isReadymadeOrder && dispatchedTotal > 0) {
          try {
            // Get all order_items with product_master_id from specifications
            const { data: orderItemsData } = await (supabase as any)
              .from('order_items')
              .select('id, quantity, specifications')
              .eq('is_deleted', false)
              .eq('order_id', dispatchTarget.order_id);

            if (orderItemsData && orderItemsData.length > 0) {
              const totalOrderQty = orderItemsData.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
              
              // Calculate remaining to distribute (to handle rounding errors)
              let remainingDispatch = dispatchedTotal;
              
              // Process each order item and update stock proportionally
              for (let i = 0; i < orderItemsData.length; i++) {
                const orderItem = orderItemsData[i];
                const specs = orderItem.specifications || {};
                const productMasterId = specs.product_master_id;
                
                if (!productMasterId) continue;

                const orderItemQty = Number(orderItem.quantity || 0);
                
                // Calculate proportional dispatched quantity for this product
                // For the last item, use remaining dispatch to avoid rounding errors
                let proportionalDispatch: number;
                if (i === orderItemsData.length - 1) {
                  proportionalDispatch = remainingDispatch;
                } else {
                  proportionalDispatch = totalOrderQty > 0 
                    ? Math.round((orderItemQty / totalOrderQty) * dispatchedTotal)
                    : 0;
                  remainingDispatch -= proportionalDispatch;
                }

                if (proportionalDispatch > 0) {
                  // Get current stock
                  const { data: productData, error: productError } = await (supabase as any)
                    .from('product_master')
                    .select('current_stock')
                    .eq('id', productMasterId)
                    .single();

                  if (!productError && productData) {
                    const currentStock = Number(productData.current_stock || 0);
                    const newStock = Math.max(0, currentStock - proportionalDispatch);

                    // Update product_master stock
                    const { error: updateError } = await (supabase as any)
                      .from('product_master')
                      .update({ current_stock: newStock } as any)
                      .eq('id', productMasterId);

                    if (updateError) {
                      console.error(`Error updating stock for product ${productMasterId}:`, updateError);
                    } else {
                      console.log(`Updated stock for product ${productMasterId}: ${currentStock} - ${proportionalDispatch} = ${newStock}`);
                    }
                  }
                }
              }
            }
          } catch (stockError) {
            console.error('Error updating product stock for readymade order:', stockError);
            // Don't fail the dispatch if stock update fails, but log the error
            // Note: Stock should be updated manually if this fails
          }
        }
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
          .eq('is_deleted', false)
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

  const incDispatch = (
    orderItemId: string,
    sizeName: string,
    delta: number,
    maxAllowed: number
  ) => {
    const key = dispatchLineKey(orderItemId, sizeName);
    setDispatchQtyByLine((prev) => {
      const next = { ...prev };
      const curr = Number(next[key] || 0);
      next[key] = Math.max(0, Math.min(maxAllowed, curr + delta));
      return next;
    });
  };

  const setDispatchDirect = (
    orderItemId: string,
    sizeName: string,
    value: number,
    maxAllowed: number
  ) => {
    const key = dispatchLineKey(orderItemId, sizeName);
    setDispatchQtyByLine((prev) => ({
      ...prev,
      [key]: Math.max(0, Math.min(maxAllowed, Number(value) || 0)),
    }));
  };

  const enrichDispatchItems = async (
    items: Array<{ size_name: string; quantity: number; order_item_id?: string | null }>
  ) => {
    const itemIds = Array.from(
      new Set(items.map((i) => i.order_item_id).filter(Boolean) as string[])
    );
    let labelByItemId: Record<string, string> = {};
    if (itemIds.length > 0) {
      const { data: orderItems } = await (supabase as any)
        .from('order_items')
        .select('id, product_description, specifications')
        .in('id', itemIds);
      (orderItems || []).forEach((it: any) => {
        if (it?.id) labelByItemId[it.id] = describeDispatchOrderLine(it);
      });
    }
    return items.map((item) => ({
      ...item,
      label: item.order_item_id
        ? labelByItemId[item.order_item_id] || 'Product'
        : undefined,
    }));
  };

  const openDetailsModal = async (order: any) => {
    setSelectedOrder(order);
    setDispatchItems([]);
    setLoadingDetails(true);
    setDetailsOpen(true);

    // Load dispatch items if this is a dispatch record
    if (order.id && order.dispatch_number) {
      try {
        const { data, error } = await (supabase as any)
          .from('dispatch_order_items')
          .select('size_name, quantity, order_item_id')
          .eq('is_deleted', false)
          .eq('dispatch_order_id', order.id);
        
        if (!error && data) {
          setDispatchItems(await enrichDispatchItems(data));
        }
      } catch (error) {
        console.error('Error loading dispatch items:', error);
      }
    } else if (order.order_id) {
      // For ready to dispatch orders, load all dispatch items for this order
      try {
        // First, try to find the latest dispatch order (challan) for this order
        const { data: dispatchOrders } = await (supabase as any)
          .from('dispatch_orders')
          .select('id, dispatch_number, dispatch_date, courier_name, tracking_number, status')
          .eq('is_deleted', false)
          .eq('order_id', order.order_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        // If we found a dispatch order, add its details to selectedOrder
        if (dispatchOrders) {
          setSelectedOrder({
            ...order,
            id: dispatchOrders.id,
            dispatch_number: dispatchOrders.dispatch_number,
            dispatch_date: dispatchOrders.dispatch_date,
            courier_name: dispatchOrders.courier_name,
            tracking_number: dispatchOrders.tracking_number,
            dispatch_status: dispatchOrders.status
          });
        }
        
        // Load all dispatch items for this order
        const { data, error } = await (supabase as any)
          .from('dispatch_order_items')
          .select('size_name, quantity, order_item_id')
          .eq('is_deleted', false)
          .eq('order_id', order.order_id);
        
        if (!error && data) {
          setDispatchItems(await enrichDispatchItems(data));
        }
      } catch (error) {
        console.error('Error loading dispatch items:', error);
      }
    }
    
    setLoadingDetails(false);
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

        <label
          htmlFor="dispatch-qc-view-switch"
          className="orders-view-switch mb-4"
          aria-label="Switch between pending and completed dispatch"
        >
          <input
            id="dispatch-qc-view-switch"
            type="checkbox"
            role="switch"
            aria-checked={activeTab === 'completed'}
            checked={activeTab === 'completed'}
            onChange={(e) => setActiveTab(e.target.checked ? 'completed' : 'pending')}
          />
          <span>Pending</span>
          <span>Dispatch Completed</span>
        </label>

          {activeTab === 'pending' && (
          <div className="space-y-4">
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : pendingOrders.length === 0 ? (
              <p className="text-muted-foreground">No orders with remaining quantity to dispatch.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingOrders.map((o) => (
                  <Card key={o.order_id} className="border hover:shadow-md transition cursor-pointer" onClick={() => openDispatchDialog(o)}>
                    <CardContent className="pt-6 pb-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          {/* Product Image - Larger and more prominent */}
                          <div className="flex-shrink-0 h-24 w-24">
                            <OrderMultiImagePanel
                              urls={resolveOrderImageUrls(o.image_urls, o.image_url)}
                              alt={o.order_number}
                              variant="compact"
                            />
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold text-base">Order #{o.order_number}</div>
                            <div className="text-sm text-muted-foreground mt-1">{o.customer_name}</div>
                        </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge className="bg-blue-100 text-blue-800 text-xs px-2.5 py-1">Approved: {o.approved_quantity}</Badge>
                          <Badge className="bg-green-100 text-green-800 text-xs px-2.5 py-1">Picked: {o.picked_quantity}</Badge>
                          <Badge className="bg-orange-100 text-orange-800 text-xs px-2.5 py-1">Dispatched: {o.dispatched_quantity || 0}</Badge>
                          <Badge className="bg-purple-100 text-purple-800 text-xs px-2.5 py-1">Remaining: {o.approved_quantity - (o.dispatched_quantity || 0)}</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
          )}

          {activeTab === 'completed' && (
          <div className="space-y-4">
            {completed.length === 0 && readyToDispatchOrders.length === 0 ? (
              <p className="text-muted-foreground">No completed dispatch orders.</p>
            ) : (
              <div className="space-y-4">
                {/* Ready to Dispatch Orders (from QC approved) */}
                {readyToDispatchOrders.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Ready to Dispatch Orders</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {readyToDispatchOrders.map((o) => (
                        <Card key={o.order_id} className="border hover:shadow-md transition cursor-pointer" onClick={() => openDetailsModal(o)}>
                          <CardContent className="pt-6 pb-6">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-4">
                                {/* Product Image - Larger */}
                                <div className="flex-shrink-0 h-20 w-20">
                                  <OrderMultiImagePanel
                                    urls={resolveOrderImageUrls(o.image_urls, o.image_url)}
                                    alt={o.order_number}
                                    variant="compact"
                                  />
                                </div>
                                <div className="flex-1">
                                  <div className="font-semibold text-base">Order #{o.order_number}</div>
                                  <div className="text-sm text-muted-foreground mt-1">{o.customer_name}</div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              <div>Approved: {o.approved_quantity}</div>
                              <div>Dispatched: {o.dispatched_quantity || 0}</div>
                                  </div>
                                </div>
                              </div>
                              <Badge className="bg-green-100 text-green-800 text-xs px-2.5 py-1 h-fit">Ready to Dispatch</Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Completed Dispatch Orders (from dispatch_orders table) */}
                {completed.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Dispatch Records</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {(completed || []).map((d: any) => (
                        <Card key={d.id} className="border hover:shadow-md transition cursor-pointer" onClick={() => openDetailsModal(d)}>
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
                  </div>
                )}
              </div>
            )}
          </div>
          )}
      </div>

      {/* Dispatch dialog */}
      <Dialog open={dispatchOpen} onOpenChange={(v) => { if (!v) { setDispatchOpen(false); setDispatchTarget(null); } }}>
        <DialogContent className="w-[96vw] max-w-3xl max-h-[90vh] overflow-hidden p-0 sm:p-6">
          <DialogHeader className="px-4 pt-4 sm:px-0 sm:pt-0">
            <DialogTitle>Mark RTD</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto px-4 pb-4 sm:px-0 sm:pb-0 max-h-[calc(90vh-72px)]">
            {/* Order info with product image */}
            <div className="flex items-center gap-4 pb-3 border-b">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border bg-muted/30">
                <OrderMultiImagePanel
                  urls={resolveOrderImageUrls(
                    dispatchTarget?.image_urls,
                    dispatchTarget?.image_url
                  )}
                  alt={dispatchTarget?.order_number || 'Order'}
                  variant="compact"
                  className="h-full w-full"
                />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-base">Order #{dispatchTarget?.order_number}</div>
                {dispatchTarget?.customer_name && (
                  <div className="text-sm text-muted-foreground mt-1">{dispatchTarget.customer_name}</div>
                )}
                {productLines.length > 1 ? (
                  <div className="text-xs text-muted-foreground mt-1">
                    {productLines.length} products in this order
                  </div>
                ) : null}
              </div>
            </div>

            {isLegacyMerged ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Products are not separated on this order; sizes are combined across all lines.
              </div>
            ) : null}

            {productLines.length === 0 ? (
              <div className="text-xs text-muted-foreground border rounded p-3">
                No pending quantities to dispatch.
              </div>
            ) : (
              <div className="space-y-4">
                {productLines.map((line) => (
                  <DispatchProductSection
                    key={line.order_item_id}
                    line={line}
                    isReadymadeOrder={isReadymadeOrder}
                    dispatchQtyByLine={dispatchQtyByLine}
                    onInc={incDispatch}
                    onSetDirect={setDispatchDirect}
                  />
                ))}
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
            <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-background pb-1">
              <Button variant="outline" onClick={() => { setDispatchOpen(false); setDispatchTarget(null); }} disabled={savingDispatch}>Cancel</Button>
              {!dispatchOrderId ? (
                <Button onClick={handleGenerateChallan} disabled={savingDispatch}>Generate Challan</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => { 
                    if (dispatchOrderId) {
                      try {
                        const challanUrl = `/dispatch/challan/${dispatchOrderId}`;
                        const newWindow = window.open(challanUrl, '_blank');
                        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                          window.location.href = challanUrl;
                        }
                      } catch (error) {
                        console.error('Error opening challan:', error);
                        window.location.href = `/dispatch/challan/${dispatchOrderId}`;
                      }
                    }
                  }}>View/Print Challan</Button>
                  <Button onClick={handleMarkDispatch} disabled={savingDispatch}>Mark RTD</Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Details Modal */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              {/* Order Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h3 className="font-semibold">Order Information</h3>
                  <div className="text-sm space-y-1">
                    <div><span className="font-medium">Order Number:</span> {selectedOrder.order_number || selectedOrder.orders?.order_number}</div>
                    <div><span className="font-medium">Customer:</span> {selectedOrder.customer_name || selectedOrder.orders?.customers?.company_name}</div>
                    {selectedOrder.approved_quantity && (
                      <div><span className="font-medium">Approved Quantity:</span> {selectedOrder.approved_quantity}</div>
                    )}
                    {selectedOrder.dispatched_quantity !== undefined && (
                      <div><span className="font-medium">Dispatched Quantity:</span> {selectedOrder.dispatched_quantity}</div>
                    )}
                    {selectedOrder.picked_quantity && (
                      <div><span className="font-medium">Picked Quantity:</span> {selectedOrder.picked_quantity}</div>
                    )}
                  </div>
                </div>
                
                {selectedOrder.dispatch_number && (
                  <div className="space-y-2">
                    <h3 className="font-semibold">Dispatch Information</h3>
                    <div className="text-sm space-y-1">
                      <div><span className="font-medium">Dispatch Number:</span> {selectedOrder.dispatch_number}</div>
                      <div><span className="font-medium">Dispatch Date:</span> {new Date(selectedOrder.dispatch_date).toLocaleString()}</div>
                      {selectedOrder.courier_name && (
                        <div><span className="font-medium">Courier:</span> {selectedOrder.courier_name}</div>
                      )}
                      {selectedOrder.tracking_number && (
                        <div><span className="font-medium">Tracking Number:</span> {selectedOrder.tracking_number}</div>
                      )}
                      {selectedOrder.actual_delivery && (
                        <div><span className="font-medium">Delivered:</span> {new Date(selectedOrder.actual_delivery).toLocaleString()}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Dispatch Items by Size */}
              {selectedOrder.order_id && (
                <div className="space-y-2">
                  <h3 className="font-semibold">Dispatch Items by Size</h3>
                  <div className="border rounded-lg p-4">
                    {loadingDetails ? (
                      <div className="text-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                        <div className="text-sm text-muted-foreground">Loading dispatch items...</div>
                      </div>
                    ) : dispatchItems.length > 0 ? (
                      (() => {
                        const hasProductSplit = dispatchItems.some((i) => i.order_item_id);
                        if (!hasProductSplit) {
                          return (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                              {dispatchItems.map((item, index) => (
                                <div key={index} className="border rounded-lg p-3 text-center">
                                  <div className="text-sm font-medium text-gray-700">{item.size_name}</div>
                                  <div className="text-lg font-bold text-blue-600">{item.quantity}</div>
                                  <div className="text-xs text-gray-500">pieces</div>
                                </div>
                              ))}
                            </div>
                          );
                        }
                        const byProduct = new Map<string, typeof dispatchItems>();
                        dispatchItems.forEach((item) => {
                          const key = item.order_item_id || 'legacy';
                          if (!byProduct.has(key)) byProduct.set(key, []);
                          byProduct.get(key)!.push(item);
                        });
                        return (
                          <div className="space-y-4">
                            {Array.from(byProduct.entries()).map(([key, items]) => (
                              <div key={key}>
                                <div className="text-sm font-medium mb-2">
                                  {items[0]?.label || 'All products (combined)'}
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                  {items.map((item, index) => (
                                    <div key={index} className="border rounded-lg p-3 text-center">
                                      <div className="text-sm font-medium text-gray-700">{item.size_name}</div>
                                      <div className="text-lg font-bold text-blue-600">{item.quantity}</div>
                                      <div className="text-xs text-gray-500">pieces</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="text-center py-4 text-sm text-muted-foreground">
                        No dispatch items found
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end space-x-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                  Close
                </Button>
                {(selectedOrder.dispatch_number || selectedOrder.id || selectedOrder.order_id) && (
                  <Button 
                    onClick={async () => {
                      // Open challan using dispatch order ID
                      const dispatchId = selectedOrder.id || selectedOrder.dispatch_order_id;
                      if (dispatchId) {
                        try {
                          const challanUrl = `/dispatch/challan/${dispatchId}`;
                          const newWindow = window.open(challanUrl, '_blank');
                          if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                            window.location.href = challanUrl;
                          }
                        } catch (error) {
                          console.error('Error opening challan:', error);
                          window.location.href = `/dispatch/challan/${dispatchId}`;
                        }
                      } else if (selectedOrder.order_id) {
                        // If no dispatch ID, try to find the latest dispatch order
                        try {
                          const { data: dispatchOrder } = await (supabase as any)
                            .from('dispatch_orders')
                            .select('id')
                            .eq('order_id', selectedOrder.order_id)
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .maybeSingle();
                          
                          if (dispatchOrder?.id) {
                            try {
                              const challanUrl = `/dispatch/challan/${dispatchOrder.id}`;
                              const newWindow = window.open(challanUrl, '_blank');
                              if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                                window.location.href = challanUrl;
                              }
                            } catch (error) {
                              console.error('Error opening challan:', error);
                              window.location.href = `/dispatch/challan/${dispatchOrder.id}`;
                            }
                          } else {
                            toast.error('No delivery challan found for this order');
                          }
                        } catch (error) {
                          console.error('Error finding dispatch order:', error);
                          toast.error('Error loading delivery challan');
                        }
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    View/Print Challan
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ErpLayout>
  );
}


