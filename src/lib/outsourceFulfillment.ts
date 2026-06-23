import { supabase } from '@/integrations/supabase/client';
import type { ExecutionFlow, FulfillmentStatus } from '@/domain/fulfillment/types';
import { FulfillmentPolicy } from '@/domain/fulfillment/policy';
import { getOrderLineSizeRows, normalizeSizesQuantities, parseOrderLineSpecifications } from '@/lib/orderLineSizes';

export type OutsourceProcurementPhase = 'awaiting_po' | 'awaiting_grn' | 'received';

export type OutsourceLineContext = {
  order_item_id: string;
  order_id: string;
  order_number?: string;
  product_label?: string;
  quantity: number;
  po_id?: string;
  po_number?: string;
  po_item_id?: string;
  po_quantity: number;
  grn_approved_quantity: number;
  phase: OutsourceProcurementPhase;
};

export type OutsourcePoAwaitingGrn = {
  po_id: string;
  po_number: string;
  order_id: string;
  order_number: string;
  supplier_name?: string;
  order_date?: string | null;
  po_quantity: number;
  grn_approved_quantity: number;
  remaining_quantity: number;
};

export function outsourceProcurementPhase(
  poQuantity: number,
  grnApproved: number
): OutsourceProcurementPhase {
  if (poQuantity <= 0) return 'awaiting_po';
  if (grnApproved < poQuantity) return 'awaiting_grn';
  return 'received';
}

export function describeLineFulfillmentNextStep(
  flow: ExecutionFlow | null | undefined,
  fulfillment: FulfillmentStatus | null | undefined,
  procurement?: Pick<OutsourceLineContext, 'phase'> | null
): string {
  if (flow === 'outsource' && fulfillment === 'flow_assigned') {
    if (procurement?.phase === 'awaiting_grn') return 'Create GRN for linked purchase order';
    if (procurement?.phase === 'received') return 'Ready for dispatch';
    return FulfillmentPolicy.describeNextStep('outsource', 'flow_assigned');
  }
  if (flow === 'outsource' && fulfillment === 'awaiting_procurement') {
    return 'Create GRN for linked purchase order';
  }
  if (flow === 'outsource' && fulfillment === 'ready_for_dispatch') {
    return 'Ready for dispatch';
  }
  return FulfillmentPolicy.describeNextStep(
    (flow ?? null) as ExecutionFlow | null,
    (fulfillment ?? 'flow_assigned') as FulfillmentStatus
  );
}

/** Approved GRN qty per sales order line (outsource PO linkage). */
export async function loadOutsourceGrnApprovedByLine(
  orderItemIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = [...new Set(orderItemIds.filter(Boolean))];
  if (!ids.length) return out;

  const { data: poiRows, error } = await supabase
    .from('purchase_order_items')
    .select('id, sales_order_item_id, quantity')
    .in('sales_order_item_id', ids as any);

  if (error || !poiRows?.length) return out;

  const poItemIds = poiRows.map((r: any) => r.id).filter(Boolean);
  const { data: grnRows } = await supabase
    .from('grn_items')
    .select('po_item_id, approved_quantity, quality_status')
    .in('po_item_id', poItemIds as any);

  const grnByPoItem = new Map<string, number>();
  for (const g of grnRows || []) {
    const poItemId = String((g as any).po_item_id || '');
    if (!poItemId) continue;
    if (String((g as any).quality_status || '').toLowerCase() !== 'approved') continue;
    grnByPoItem.set(poItemId, (grnByPoItem.get(poItemId) || 0) + Number((g as any).approved_quantity || 0));
  }

  for (const row of poiRows as any[]) {
    const lineId = String(row.sales_order_item_id || '');
    if (!lineId) continue;
    const approved = grnByPoItem.get(String(row.id)) || 0;
    out.set(lineId, (out.get(lineId) || 0) + approved);
  }
  return out;
}

export async function loadOutsourceLineContextsForOrder(
  orderId: string
): Promise<Record<string, OutsourceLineContext>> {
  const result: Record<string, OutsourceLineContext> = {};

  const { data: lines } = await supabase
    .from('order_items')
    .select('id, order_id, quantity, product_description, specifications, execution_flow')
    .eq('order_id', orderId)
    .eq('execution_flow', 'outsource');

  if (!lines?.length) return result;

  const lineIds = lines.map((l: any) => l.id);
  const { data: orderRow } = await supabase
    .from('orders')
    .select('order_number')
    .eq('id', orderId)
    .maybeSingle();

  const { data: poiRows } = await supabase
    .from('purchase_order_items')
    .select('id, po_id, sales_order_item_id, quantity, purchase_orders(po_number)')
    .in('sales_order_item_id', lineIds as any);

  const poItemIds = (poiRows || []).map((r: any) => r.id).filter(Boolean);
  const grnByPoItem = new Map<string, number>();
  if (poItemIds.length) {
    const { data: grnRows } = await supabase
      .from('grn_items')
      .select('po_item_id, approved_quantity, quality_status')
      .in('po_item_id', poItemIds as any);
    for (const g of grnRows || []) {
      const poItemId = String((g as any).po_item_id || '');
      if (!poItemId) continue;
      if (String((g as any).quality_status || '').toLowerCase() !== 'approved') continue;
      grnByPoItem.set(poItemId, (grnByPoItem.get(poItemId) || 0) + Number((g as any).approved_quantity || 0));
    }
  }

  const poiByLine = new Map<string, any>();
  for (const poi of poiRows || []) {
    const lid = String((poi as any).sales_order_item_id || '');
    if (lid) poiByLine.set(lid, poi);
  }

  for (const line of lines as any[]) {
    const poi = poiByLine.get(line.id);
    const poQty = Number(poi?.quantity || 0);
    const grnApproved = poi ? grnByPoItem.get(String(poi.id)) || 0 : 0;
    const specs = parseOrderLineSpecifications(line.specifications);
    const label =
      String(line.product_description || '').trim() ||
      String(specs.product_name || specs.class || '').trim() ||
      'Product';

    result[line.id] = {
      order_item_id: line.id,
      order_id: orderId,
      order_number: (orderRow as any)?.order_number,
      product_label: label,
      quantity: Number(line.quantity || 0),
      po_id: poi?.po_id,
      po_number: (poi?.purchase_orders as any)?.po_number,
      po_item_id: poi?.id,
      po_quantity: poQty,
      grn_approved_quantity: grnApproved,
      phase: outsourceProcurementPhase(poQty, grnApproved),
    };
  }

  return result;
}

export async function loadOutsourceLinesAwaitingPo(): Promise<OutsourceLineContext[]> {
  const { data: lines, error } = await supabase
    .from('order_items')
    .select(
      'id, order_id, quantity, product_description, specifications, orders!inner(order_number, is_deleted, status)'
    )
    .eq('execution_flow', 'outsource')
    .eq('fulfillment_status', 'flow_assigned')
    .eq('is_deleted', false);

  if (error || !lines?.length) return [];

  const lineIds = lines.map((l: any) => l.id);
  const { data: linked } = await supabase
    .from('purchase_order_items')
    .select('sales_order_item_id')
    .in('sales_order_item_id', lineIds as any);

  const linkedSet = new Set((linked || []).map((r: any) => r.sales_order_item_id));

  return (lines as any[])
    .filter((l) => !linkedSet.has(l.id))
    .filter((l) => !(l.orders as any)?.is_deleted)
    .filter((l) => !['cancelled', 'completed'].includes(String((l.orders as any)?.status || '')))
    .map((l) => {
      const specs = parseOrderLineSpecifications(l.specifications);
      return {
        order_item_id: l.id,
        order_id: l.order_id,
        order_number: (l.orders as any)?.order_number,
        product_label:
          String(l.product_description || '').trim() ||
          String(specs.product_name || '').trim() ||
          'Product',
        quantity: Number(l.quantity || 0),
        po_quantity: 0,
        grn_approved_quantity: 0,
        phase: 'awaiting_po' as const,
      };
    });
}

export async function loadOutsourcePosAwaitingGrn(): Promise<OutsourcePoAwaitingGrn[]> {
  const { data: poRows, error } = await supabase
    .from('purchase_orders')
    .select(
      'id, po_number, order_date, sales_order_id, supplier:suppliers(supplier_name), purchase_order_items(id, quantity, sales_order_item_id)'
    )
    .not('sales_order_id', 'is', null)
    .eq('is_deleted', false);

  if (error || !poRows?.length) return [];

  const allLineIds = (poRows as any[])
    .flatMap((po) => (po.purchase_order_items || []).map((pi: any) => pi.sales_order_item_id))
    .filter(Boolean);
  const outsourceLineIds = new Set<string>();
  if (allLineIds.length) {
    const { data: lineRows } = await supabase
      .from('order_items')
      .select('id')
      .in('id', allLineIds as any)
      .eq('execution_flow', 'outsource');
    for (const row of lineRows || []) {
      outsourceLineIds.add(String((row as any).id));
    }
  }

  const out: OutsourcePoAwaitingGrn[] = [];
  const orderIds = [...new Set((poRows as any[]).map((p) => p.sales_order_id).filter(Boolean))];
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number')
    .in('id', orderIds as any);
  const orderNumById = new Map((orders || []).map((o: any) => [o.id, o.order_number]));

  for (const po of poRows as any[]) {
    const items = (po.purchase_order_items || []).filter(
      (pi: any) => pi?.sales_order_item_id && outsourceLineIds.has(String(pi.sales_order_item_id))
    );
    if (!items.length) continue;

    let poQty = 0;
    let grnApproved = 0;
    const poItemIds = items.map((pi: any) => pi.id).filter(Boolean);
    if (poItemIds.length) {
      const { data: grnRows } = await supabase
        .from('grn_items')
        .select('po_item_id, approved_quantity, quality_status')
        .in('po_item_id', poItemIds as any);
      const grnByPoItem = new Map<string, number>();
      for (const g of grnRows || []) {
        const pid = String((g as any).po_item_id || '');
        if (!pid) continue;
        if (String((g as any).quality_status || '').toLowerCase() !== 'approved') continue;
        grnByPoItem.set(pid, (grnByPoItem.get(pid) || 0) + Number((g as any).approved_quantity || 0));
      }
      for (const pi of items) {
        poQty += Number(pi.quantity || 0);
        grnApproved += grnByPoItem.get(String(pi.id)) || 0;
      }
    }

    if (poQty <= grnApproved) continue;

    out.push({
      po_id: po.id,
      po_number: po.po_number,
      order_id: po.sales_order_id,
      order_number: orderNumById.get(po.sales_order_id) || '—',
      supplier_name: (po.supplier as any)?.supplier_name,
      order_date: po.order_date,
      po_quantity: poQty,
      grn_approved_quantity: grnApproved,
      remaining_quantity: Math.max(0, poQty - grnApproved),
    });
  }

  return out.sort((a, b) => String(b.order_date || '').localeCompare(String(a.order_date || '')));
}

/** Approved GRN qty per sales order line + size (outsource manual PO linkage). */
export async function loadOutsourceGrnApprovedByLineAndSize(
  orderItemIds: string[]
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();
  const ids = [...new Set(orderItemIds.filter(Boolean))];
  if (!ids.length) return out;

  const { data: poiRows, error } = await supabase
    .from('purchase_order_items')
    .select('id, sales_order_item_id, sizes_quantities, entry_mode')
    .in('sales_order_item_id', ids as any);

  if (error || !poiRows?.length) return out;

  const poItemIds = poiRows.map((r: any) => r.id).filter(Boolean);
  const { data: grnRows } = await supabase
    .from('grn_items')
    .select('po_item_id, size_name, approved_quantity, quality_status')
    .in('po_item_id', poItemIds as any);

  const grnByPoItemSize = new Map<string, number>();
  for (const g of grnRows || []) {
    const poItemId = String((g as any).po_item_id || '');
    if (!poItemId) continue;
    if (String((g as any).quality_status || '').toLowerCase() !== 'approved') continue;
    const sizeKey = String((g as any).size_name || 'Total');
    const mapKey = `${poItemId}|${sizeKey}`;
    grnByPoItemSize.set(
      mapKey,
      (grnByPoItemSize.get(mapKey) || 0) + Number((g as any).approved_quantity || 0)
    );
  }

  for (const poi of poiRows as any[]) {
    const lineId = String(poi.sales_order_item_id || '');
    if (!lineId) continue;

    const sizes = normalizeSizesQuantities(poi.sizes_quantities);
    const hasManualSizes =
      poi.entry_mode === 'outsource_manual' && Object.keys(sizes).length > 0;

    if (hasManualSizes) {
      const lineMap = out.get(lineId) || {};
      for (const [size, _ordered] of Object.entries(sizes)) {
        const approved = grnByPoItemSize.get(`${poi.id}|${size}`) || 0;
        if (approved > 0) {
          lineMap[size] = (lineMap[size] || 0) + approved;
        }
      }
      if (Object.keys(lineMap).length > 0) {
        out.set(lineId, lineMap);
      }
      continue;
    }

    let totalApproved = 0;
    for (const [key, qty] of grnByPoItemSize.entries()) {
      if (key.startsWith(`${poi.id}|`)) {
        totalApproved += qty;
      }
    }
    if (totalApproved > 0) {
      const lineMap = out.get(lineId) || {};
      lineMap.Total = (lineMap.Total || 0) + totalApproved;
      out.set(lineId, lineMap);
    }
  }

  return out;
}

/** Build approved qty map per line + size for outsource dispatch (GRN-based). */
export async function loadOutsourceApprovedByLineAndSize(
  orderId: string,
  orderItems: any[]
): Promise<Record<string, Record<string, number>>> {
  const outsourceItems = orderItems.filter((it) => it?.execution_flow === 'outsource');
  if (!outsourceItems.length) return {};

  const perSizeFromGrn = await loadOutsourceGrnApprovedByLineAndSize(
    outsourceItems.map((it) => it.id)
  );
  const grnByLine = await loadOutsourceGrnApprovedByLine(outsourceItems.map((it) => it.id));
  const approvedByLine: Record<string, Record<string, number>> = {};

  for (const item of outsourceItems) {
    const fromPerSize = perSizeFromGrn.get(item.id);
    if (fromPerSize && Object.keys(fromPerSize).length > 0) {
      approvedByLine[item.id] = fromPerSize;
      continue;
    }

    const totalApproved = grnByLine.get(item.id) || 0;
    if (totalApproved <= 0) continue;

    const specs = parseOrderLineSpecifications(item.specifications);
    const sizeRows = getOrderLineSizeRows(specs, item.quantity, item.sizes_quantities);
    const approvedMap: Record<string, number> = {};

    if (sizeRows.length > 0) {
      const orderQty = sizeRows.reduce((s, r) => s + r.qty, 0) || Number(item.quantity || 0);
      const scale = orderQty > 0 ? totalApproved / orderQty : 1;
      let allocated = 0;
      sizeRows.forEach((sr, idx) => {
        const qty =
          idx === sizeRows.length - 1
            ? Math.max(0, totalApproved - allocated)
            : Math.round(sr.qty * scale);
        if (qty > 0) {
          approvedMap[sr.size] = (approvedMap[sr.size] || 0) + qty;
          allocated += qty;
        }
      });
    } else {
      approvedMap.Total = totalApproved;
    }

    approvedByLine[item.id] = approvedMap;
  }

  return approvedByLine;
}

export type OutsourceDispatchCandidate = {
  order_id: string;
  order_number: string;
  customer_name?: string;
  approved_quantity: number;
  order_type?: string | null;
};

/** Custom orders with outsource GRN qty available for dispatch (no batch QC required). */
export async function loadOutsourceDispatchCandidates(): Promise<OutsourceDispatchCandidate[]> {
  const { data: lines } = await supabase
    .from('order_items')
    .select('id, order_id, quantity, execution_flow, orders!inner(id, order_number, order_type, is_deleted, status, customers(company_name))')
    .eq('execution_flow', 'outsource')
    .eq('is_deleted', false);

  if (!lines?.length) return [];

  const byOrder = new Map<string, { order: any; lineIds: string[]; orderQty: number }>();
  for (const row of lines as any[]) {
    const ord = row.orders;
    if (!ord || ord.is_deleted) continue;
    if (['cancelled', 'completed'].includes(String(ord.status || ''))) continue;
    if (ord.order_type === 'readymade') continue;
    const oid = row.order_id as string;
    if (!byOrder.has(oid)) {
      byOrder.set(oid, { order: ord, lineIds: [], orderQty: 0 });
    }
    const bucket = byOrder.get(oid)!;
    bucket.lineIds.push(row.id);
    bucket.orderQty += Number(row.quantity || 0);
  }

  if (!byOrder.size) return [];

  const allLineIds = [...byOrder.values()].flatMap((b) => b.lineIds);
  const grnByLine = await loadOutsourceGrnApprovedByLine(allLineIds);

  const orderIds = [...byOrder.keys()];
  const dispatchedByOrder = new Map<string, number>();
  const { data: disp } = await supabase
    .from('dispatch_order_items')
    .select('order_id, quantity')
    .eq('is_deleted', false)
    .in('order_id', orderIds as any);
  for (const d of disp || []) {
    const oid = String((d as any).order_id || '');
    dispatchedByOrder.set(oid, (dispatchedByOrder.get(oid) || 0) + Number((d as any).quantity || 0));
  }

  const candidates: OutsourceDispatchCandidate[] = [];
  for (const [orderId, bucket] of byOrder) {
    let approved = 0;
    for (const lid of bucket.lineIds) {
      approved += grnByLine.get(lid) || 0;
    }
    if (approved <= 0) continue;
    const dispatched = dispatchedByOrder.get(orderId) || 0;
    if (dispatched >= approved) continue;

    candidates.push({
      order_id: orderId,
      order_number: bucket.order.order_number,
      customer_name: (bucket.order.customers as any)?.company_name,
      approved_quantity: approved,
      order_type: bucket.order.order_type ?? null,
    });
  }

  return candidates;
}
