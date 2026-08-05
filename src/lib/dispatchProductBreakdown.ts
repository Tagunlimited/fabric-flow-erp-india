import { supabase } from '@/integrations/supabase/client';
import { getOrderLineSizeRows, parseOrderLineSpecifications } from '@/lib/orderLineSizes';
import { getOrderItemListThumbnailUrl } from '@/utils/orderItemImageUtils';
import { parseLineOrderItemIdFromNotes } from '@/utils/orderBatchAssignmentLine';
import { productFabricLineFromOrderItem } from '@/utils/batchAssignmentDocument';
import { sortSizeDistributionsByMasterOrder, type SizeType } from '@/utils/sizeSorting';
import { loadOutsourceApprovedByLineAndSize } from '@/lib/outsourceFulfillment';

export const DISPATCH_LEGACY_BUCKET = '__legacy__';

export type DispatchSizeRow = {
  size_name: string;
  approved: number;
  dispatched: number;
  to_dispatch: number;
};

export type DispatchProductLine = {
  order_item_id: string;
  label: string;
  image_url?: string;
  size_type_id?: string | null;
  approved_total: number;
  dispatched_total: number;
  remaining_total: number;
  sizes: DispatchSizeRow[];
};

export type DispatchQtyKey = `${string}::${string}`;

export type LoadDispatchProductBreakdownResult = {
  productLines: DispatchProductLine[];
  isLegacyMerged: boolean;
};

export function dispatchLineKey(orderItemId: string, sizeName: string): DispatchQtyKey {
  return `${orderItemId}::${sizeName}`;
}

export function parseDispatchLineKey(key: string): { orderItemId: string; sizeName: string } | null {
  const idx = key.indexOf('::');
  if (idx <= 0) return null;
  return {
    orderItemId: key.slice(0, idx),
    sizeName: key.slice(idx + 2),
  };
}

function describeOrderLine(item: any): string {
  const fabric = productFabricLineFromOrderItem(item);
  if (fabric && fabric !== 'Product') return fabric;
  const pd = item?.product_description;
  if (typeof pd === 'string' && pd.trim()) return pd.trim();
  const specs = parseOrderLineSpecifications(item?.specifications);
  const n = specs.product_name || specs.class || specs.category;
  if (typeof n === 'string' && n.trim()) return n.trim();
  return 'Product';
}

function sumSizeMap(map: Record<string, number>): number {
  return Object.values(map).reduce((s, n) => s + (Number(n) || 0), 0);
}

function buildSizeRows(
  approvedMap: Record<string, number>,
  dispatchedMap: Record<string, number>,
  sizeTypeId: string | null | undefined,
  sizeTypes: SizeType[],
  includeZeroRemaining: boolean
): DispatchSizeRow[] {
  const sizes = Array.from(
    new Set([...Object.keys(approvedMap), ...Object.keys(dispatchedMap)])
  );
  const rows = sizes
    .map((size_name) => {
      const approved = Number(approvedMap[size_name] || 0);
      const dispatched = Number(dispatchedMap[size_name] || 0);
      const to_dispatch = Math.max(0, approved - dispatched);
      return { size_name, approved, dispatched, to_dispatch };
    })
    .filter((r) => includeZeroRemaining || r.to_dispatch > 0);

  return sortSizeDistributionsByMasterOrder(rows, sizeTypeId ?? null, sizeTypes);
}

function buildProductLine(
  orderItemId: string,
  item: any | null,
  approvedMap: Record<string, number>,
  dispatchedMap: Record<string, number>,
  orderType: string | null | undefined,
  sizeTypes: SizeType[],
  includeZeroRemaining: boolean
): DispatchProductLine {
  const sizes = buildSizeRows(
    approvedMap,
    dispatchedMap,
    item?.size_type_id,
    sizeTypes,
    includeZeroRemaining
  );
  const approved_total = sumSizeMap(approvedMap);
  const dispatched_total = sumSizeMap(dispatchedMap);
  const remaining_total = Math.max(0, approved_total - dispatched_total);
  const image_url = item
    ? getOrderItemListThumbnailUrl(item, { order_type: orderType ?? undefined })
    : undefined;

  return {
    order_item_id: orderItemId,
    label:
      orderItemId === DISPATCH_LEGACY_BUCKET
        ? 'All products (combined)'
        : describeOrderLine(item),
    image_url: image_url || undefined,
    size_type_id: item?.size_type_id ?? null,
    approved_total,
    dispatched_total,
    remaining_total,
    sizes,
  };
}

export function describeDispatchOrderLine(item: any): string {
  return describeOrderLine(item);
}

async function loadCustomProductBreakdown(
  orderId: string,
  orderType: string | null | undefined,
  orderItems: any[],
  sizeTypes: SizeType[],
  includeZeroRemaining: boolean
): Promise<LoadDispatchProductBreakdownResult> {
  const { data: assignments } = await (supabase as any)
    .from('order_batch_assignments')
    .select('id, notes')
    .eq('is_deleted', false)
    .eq('order_id', orderId);

  const assignmentRows = assignments || [];
  const assignmentIds = assignmentRows.map((a: any) => a.id).filter(Boolean);

  const assignmentToLine: Record<string, string> = {};
  let taggedCount = 0;
  assignmentRows.forEach((a: any) => {
    const lineId = parseLineOrderItemIdFromNotes(a.notes);
    if (lineId) {
      assignmentToLine[a.id] = lineId;
      taggedCount += 1;
    }
  });

  const singleItemId = orderItems.length === 1 ? orderItems[0]?.id : null;
  const useLegacy =
    orderItems.length > 1 && taggedCount === 0;

  const approvedByLine: Record<string, Record<string, number>> = {};
  const addApproved = (lineId: string, size: string, qty: number) => {
    if (!approvedByLine[lineId]) approvedByLine[lineId] = {};
    approvedByLine[lineId][size] = (approvedByLine[lineId][size] || 0) + qty;
  };

  if (assignmentIds.length > 0) {
    const { data: qc } = await (supabase as any)
      .from('qc_reviews')
      .select('size_name, approved_quantity, order_batch_assignment_id')
      .eq('is_deleted', false)
      .in('order_batch_assignment_id', assignmentIds);

    (qc || []).forEach((r: any) => {
      const aid = r.order_batch_assignment_id as string;
      const size = String(r.size_name || '').trim();
      if (!aid || !size) return;
      const qty = Number(r.approved_quantity || 0);
      if (qty <= 0) return;

      let lineId = assignmentToLine[aid];
      if (!lineId) {
        if (useLegacy) lineId = DISPATCH_LEGACY_BUCKET;
        else if (singleItemId) lineId = singleItemId;
        else lineId = DISPATCH_LEGACY_BUCKET;
      }
      addApproved(lineId, size, qty);
    });
  }

  const outsourceApproved = await loadOutsourceApprovedByLineAndSize(orderId, orderItems);
  for (const [lineId, sizeMap] of Object.entries(outsourceApproved)) {
    for (const [size, qty] of Object.entries(sizeMap)) {
      addApproved(lineId, size, qty);
    }
  }

  const { data: disp } = await (supabase as any)
    .from('dispatch_order_items')
    .select('size_name, quantity, order_item_id')
    .eq('is_deleted', false)
    .eq('order_id', orderId);

  const dispatchedByLine: Record<string, Record<string, number>> = {};
  const addDispatched = (lineId: string, size: string, qty: number) => {
    if (!dispatchedByLine[lineId]) dispatchedByLine[lineId] = {};
    dispatchedByLine[lineId][size] = (dispatchedByLine[lineId][size] || 0) + qty;
  };

  (disp || []).forEach((r: any) => {
    const size = String(r.size_name || 'Total').trim() || 'Total';
    const qty = Number(r.quantity || 0);
    if (qty <= 0) return;
    const rawItemId = r.order_item_id as string | null;
    if (rawItemId) {
      addDispatched(rawItemId, size, qty);
    } else {
      addDispatched(DISPATCH_LEGACY_BUCKET, size, qty);
    }
  });

  const itemsById: Record<string, any> = {};
  orderItems.forEach((it) => {
    if (it?.id) itemsById[it.id] = it;
  });

  const lineIds = useLegacy
    ? [DISPATCH_LEGACY_BUCKET]
    : orderItems.length === 1
      ? [orderItems[0].id]
      : [
          ...new Set([
            ...Object.keys(approvedByLine),
            ...Object.keys(dispatchedByLine),
            ...orderItems.map((it) => it.id),
          ]),
        ].filter((id) => id !== DISPATCH_LEGACY_BUCKET || useLegacy);

  const productLines = lineIds
    .map((lineId) =>
      buildProductLine(
        lineId,
        lineId === DISPATCH_LEGACY_BUCKET ? null : itemsById[lineId] ?? null,
        approvedByLine[lineId] || {},
        dispatchedByLine[lineId] || {},
        orderType,
        sizeTypes,
        includeZeroRemaining
      )
    )
    .filter((pl) => includeZeroRemaining || pl.remaining_total > 0 || pl.sizes.length > 0);

  return { productLines, isLegacyMerged: useLegacy };
}

async function loadReadymadeProductBreakdown(
  orderId: string,
  orderType: string | null | undefined,
  orderItems: any[],
  sizeTypes: SizeType[],
  includeZeroRemaining: boolean
): Promise<LoadDispatchProductBreakdownResult> {
  const { data: disp } = await (supabase as any)
    .from('dispatch_order_items')
    .select('size_name, quantity, order_item_id')
    .eq('is_deleted', false)
    .eq('order_id', orderId);

  const dispatchedByLine: Record<string, Record<string, number>> = {};
  (disp || []).forEach((r: any) => {
    const size = String(r.size_name || 'Total').trim() || 'Total';
    const qty = Number(r.quantity || 0);
    if (qty <= 0) return;
    const lineId = (r.order_item_id as string) || DISPATCH_LEGACY_BUCKET;
    if (!dispatchedByLine[lineId]) dispatchedByLine[lineId] = {};
    dispatchedByLine[lineId][size] = (dispatchedByLine[lineId][size] || 0) + qty;
  });

  const productLines = orderItems.map((item) => {
    const specs = parseOrderLineSpecifications(item.specifications);
    const sizeRows = getOrderLineSizeRows(specs, item.quantity, item.sizes_quantities);
    const approvedMap: Record<string, number> = {};
    sizeRows.forEach((sr) => {
      approvedMap[sr.size] = (approvedMap[sr.size] || 0) + sr.qty;
    });
    if (Object.keys(approvedMap).length === 0) {
      approvedMap.Total = Number(item.quantity || 0);
    }

    const lineDispatched = dispatchedByLine[item.id] || {};
    if (
      orderItems.length === 1 &&
      Object.keys(lineDispatched).length === 0 &&
      dispatchedByLine[DISPATCH_LEGACY_BUCKET]
    ) {
      Object.assign(lineDispatched, dispatchedByLine[DISPATCH_LEGACY_BUCKET]);
    }

    return buildProductLine(
      item.id,
      item,
      approvedMap,
      lineDispatched,
      orderType,
      sizeTypes,
      includeZeroRemaining
    );
  });

  const filtered = productLines.filter(
    (pl) => includeZeroRemaining || pl.remaining_total > 0 || pl.sizes.length > 0
  );

  return { productLines: filtered, isLegacyMerged: false };
}

export async function loadDispatchProductBreakdown(
  orderId: string,
  options: {
    isReadymade?: boolean;
    orderType?: string | null;
    sizeTypes: SizeType[];
    /** When true, include sizes with 0 remaining (e.g. viewing existing challan) */
    includeZeroRemaining?: boolean;
  }
): Promise<LoadDispatchProductBreakdownResult> {
  const { data: orderItems } = await (supabase as any)
    .from('order_items')
    .select(
      'id, product_description, specifications, sizes_quantities, size_type_id, quantity, mockup_images, category_image_url, execution_flow'
    )
    .eq('is_deleted', false)
    .eq('order_id', orderId);

  const items = orderItems || [];

  if (options.isReadymade) {
    return loadReadymadeProductBreakdown(
      orderId,
      options.orderType,
      items,
      options.sizeTypes,
      options.includeZeroRemaining ?? false
    );
  }

  return loadCustomProductBreakdown(
    orderId,
    options.orderType,
    items,
    options.sizeTypes,
    options.includeZeroRemaining ?? false
  );
}

/** Build dispatchQtyByLine prefill from product lines (remaining to dispatch). */
export function prefillDispatchQtyFromProductLines(
  productLines: DispatchProductLine[]
): Record<DispatchQtyKey, number> {
  const out: Record<DispatchQtyKey, number> = {};
  productLines.forEach((pl) => {
    pl.sizes.forEach((s) => {
      if (s.to_dispatch > 0) {
        out[dispatchLineKey(pl.order_item_id, s.size_name)] = s.to_dispatch;
      }
    });
  });
  return out;
}

/** Restore qty map from existing dispatch_order_items rows. */
export function dispatchQtyFromExistingItems(
  items: Array<{
    order_item_id?: string | null;
    size_name?: string | null;
    quantity?: number | null;
  }>
): Record<DispatchQtyKey, number> {
  const out: Record<DispatchQtyKey, number> = {};
  items.forEach((r) => {
    const qty = Number(r.quantity || 0);
    if (qty <= 0) return;
    const lineId = r.order_item_id || DISPATCH_LEGACY_BUCKET;
    const size = String(r.size_name || 'Total').trim() || 'Total';
    out[dispatchLineKey(lineId, size)] = qty;
  });
  return out;
}
