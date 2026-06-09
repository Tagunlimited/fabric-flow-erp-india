import { supabase } from '@/integrations/supabase/client';
import { chunkArray } from '@/lib/chunkArray';
import { fetchOrderItemsByOrderIds } from '@/lib/fetchOrderItemsBulk';
import { getOrderItemListThumbnailUrl } from '@/utils/orderItemImageUtils';
import type { QcAssignmentMeta } from '@/utils/qcOrderFilters';
import { sumAssignedFromSizeDistributions } from '@/utils/pickerRemaining';

const IN_CHUNK = 80;
const PICKED_ROWS_PAGE = 2000;
const NOTES_PAGE = 400;

const ASSIGNMENT_DETAIL_SELECT =
  'assignment_id, order_id, total_quantity, batch_name, batch_leader_name, batch_leader_avatar, batch_leader_avatar_url, batch_id, size_distributions';

const ORDER_ITEM_THUMB_SELECT =
  'order_id, category_image_url, mockup_images, specifications';

export interface QcBatchAvatarInfo {
  avatar_url: string;
  batch_name?: string;
  batch_leader_name?: string;
}

export interface QcPickedOrderCard {
  order_id: string;
  order_number: string;
  customer_name?: string;
  picked_quantity: number;
  total_quantity: number;
  image_url?: string;
  assignment_ids: string[];
  approved_quantity: number;
  rejected_quantity: number;
  is_fully_qc: boolean;
  qc_status: 'pending' | 'partial' | 'completed';
  product_category?: string;
  batch_avatars?: QcBatchAvatarInfo[];
  batch_faces?: Array<{ name: string; avatar?: string | null }>;
}

export interface LoadQcPickedOrdersResult {
  orders: QcPickedOrderCard[];
  assignmentMeta: Record<string, QcAssignmentMeta>;
}

type OrderMeta = {
  order_number?: string;
  customer_id?: string;
  order_type?: string | null;
  customer_name?: string;
};

async function fetchRowsInChunks(
  table: string,
  select: string,
  column: string,
  ids: string[],
  applyFilters?: (q: ReturnType<typeof supabase.from>) => ReturnType<typeof supabase.from>
): Promise<any[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const rows: any[] = [];
  for (const batch of chunkArray(unique, IN_CHUNK)) {
    let q = supabase.from(table as any).select(select).in(column, batch as any);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) throw error;
    if (data?.length) rows.push(...data);
  }
  return rows;
}

async function fetchAllPickedFromSizeRows(): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('order_batch_size_distributions')
      .select('order_batch_assignment_id, picked_quantity')
      .eq('is_deleted', false)
      .gt('picked_quantity', 0)
      .range(offset, offset + PICKED_ROWS_PAGE - 1);
    if (error) throw error;
    const rows = data || [];
    for (const r of rows) {
      const id = String(r.order_batch_assignment_id || '').trim();
      if (!id) continue;
      map[id] = (map[id] || 0) + Number(r.picked_quantity || 0);
    }
    if (rows.length < PICKED_ROWS_PAGE) break;
    offset += PICKED_ROWS_PAGE;
  }
  return map;
}

async function fetchPickedFromNotesMap(): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('order_batch_assignments')
      .select('id, notes')
      .eq('is_deleted', false)
      .ilike('notes', '%picked_by_size%')
      .range(offset, offset + NOTES_PAGE - 1);
    if (error) break;
    const rows = data || [];
    for (const a of rows) {
      if (!a?.id || !a?.notes) continue;
      try {
        const parsed = JSON.parse(a.notes);
        if (parsed?.picked_by_size && typeof parsed.picked_by_size === 'object') {
          let sum = 0;
          for (const v of Object.values(parsed.picked_by_size as Record<string, unknown>)) {
            sum += Number(v) || 0;
          }
          if (sum > 0) map[a.id] = sum;
        }
      } catch {
        /* legacy notes */
      }
    }
    if (rows.length < NOTES_PAGE) break;
    offset += NOTES_PAGE;
  }
  return map;
}

function mergePickedMaps(
  fromSizes: Record<string, number>,
  fromNotes: Record<string, number>
): Record<string, number> {
  const merged = { ...fromSizes };
  for (const [id, notePick] of Object.entries(fromNotes)) {
    const col = merged[id] || 0;
    if (col <= 0 && notePick > 0) merged[id] = notePick;
  }
  return merged;
}

async function fetchAssignmentDetailRows(assignmentIds: string[]): Promise<any[]> {
  return fetchRowsInChunks(
    'order_batch_assignments_with_details',
    ASSIGNMENT_DETAIL_SELECT,
    'assignment_id',
    assignmentIds
  );
}

async function fetchQcTotalsByAssignment(
  assignmentIds: string[]
): Promise<{ approved: Record<string, number>; rejected: Record<string, number> }> {
  const approved: Record<string, number> = {};
  const rejected: Record<string, number> = {};
  const rows = await fetchRowsInChunks(
    'qc_reviews',
    'order_batch_assignment_id, approved_quantity, rejected_quantity',
    'order_batch_assignment_id',
    assignmentIds,
    (q) => q.eq('is_deleted', false)
  );
  rows.forEach((q: any) => {
    const id = q?.order_batch_assignment_id as string | undefined;
    if (!id) return;
    approved[id] = (approved[id] || 0) + Number(q.approved_quantity || 0);
    rejected[id] = (rejected[id] || 0) + Number(q.rejected_quantity || 0);
  });
  return { approved, rejected };
}

async function fetchCustomOrdersMap(orderIds: string[]): Promise<Record<string, OrderMeta>> {
  const map: Record<string, OrderMeta> = {};
  const rows = await fetchRowsInChunks(
    'orders',
    'id, order_number, customer_id, order_type, customer:customers(company_name)',
    'id',
    orderIds,
    (q) => q.eq('is_deleted', false).or('order_type.is.null,order_type.eq.custom')
  );
  rows.forEach((o: any) => {
    if (!o?.id) return;
    map[o.id] = {
      order_number: o.order_number,
      customer_id: o.customer_id,
      order_type: o.order_type ?? null,
      customer_name: o.customer?.company_name ?? undefined,
    };
  });
  return map;
}

export async function resolveQcOrderThumbnails(
  orderIds: string[],
  ordersMap: Record<string, OrderMeta>
): Promise<{ imageByOrder: Record<string, string | undefined>; categoryByOrder: Record<string, string | undefined> }> {
  const imageByOrder: Record<string, string | undefined> = {};
  const categoryByOrder: Record<string, string | undefined> = {};
  const uniqueOrderIds = [...new Set(orderIds.filter(Boolean))];
  if (!uniqueOrderIds.length) return { imageByOrder, categoryByOrder };

  const { data: items } = await fetchOrderItemsByOrderIds(uniqueOrderIds, ORDER_ITEM_THUMB_SELECT);
  (items || []).forEach((it: any) => {
    const oid = it?.order_id;
    if (!oid) return;
    if (!imageByOrder[oid]) {
      const thumb = getOrderItemListThumbnailUrl(it, {
        order_type: ordersMap[oid]?.order_type ?? undefined,
      });
      if (thumb) imageByOrder[oid] = thumb;
    }
    if (!categoryByOrder[oid]) {
      try {
        const specs =
          typeof it.specifications === 'string' ? JSON.parse(it.specifications) : it.specifications;
        if (specs?.category) categoryByOrder[oid] = specs.category;
        else if (specs?.class) categoryByOrder[oid] = specs.class;
      } catch {
        /* optional */
      }
    }
  });
  return { imageByOrder, categoryByOrder };
}

export async function loadQcPickedOrdersData(): Promise<LoadQcPickedOrdersResult> {
  const [pickedFromSizes, pickedFromNotes] = await Promise.all([
    fetchAllPickedFromSizeRows(),
    fetchPickedFromNotesMap(),
  ]);
  const pickedByAssignment = mergePickedMaps(pickedFromSizes, pickedFromNotes);
  const activeAssignmentIds = Object.entries(pickedByAssignment)
    .filter(([, picked]) => picked > 0)
    .map(([id]) => id);

  if (activeAssignmentIds.length === 0) {
    return { orders: [], assignmentMeta: {} };
  }

  const [assignmentRows, qcTotals] = await Promise.all([
    fetchAssignmentDetailRows(activeAssignmentIds),
    fetchQcTotalsByAssignment(activeAssignmentIds),
  ]);

  const { approved: approvedByAssignment, rejected: rejectedByAssignment } = qcTotals;
  const rows = assignmentRows.filter((r: any) => r?.assignment_id && r?.order_id);
  if (rows.length === 0) {
    return { orders: [], assignmentMeta: {} };
  }

  const assignmentAssignedById: Record<string, number> = {};
  rows.forEach((r: any) => {
    const id = String(r?.assignment_id || '').trim();
    if (!id) return;
    const viewTot = Number(r.total_quantity ?? 0) || 0;
    const fromDist = sumAssignedFromSizeDistributions(r?.size_distributions);
    assignmentAssignedById[id] = Math.max(viewTot, fromDist);
  });

  const qcCompleteByAssignment: Record<string, boolean> = {};
  activeAssignmentIds.forEach((id) => {
    const picked = pickedByAssignment[id] || 0;
    const approved = approvedByAssignment[id] || 0;
    const rejected = rejectedByAssignment[id] || 0;
    const assigned = assignmentAssignedById[id] || 0;
    qcCompleteByAssignment[id] =
      assigned > 0 && picked >= assigned && approved >= assigned && rejected === 0;
  });

  const orderIds = Array.from(new Set(rows.map((r: any) => r.order_id).filter(Boolean)));
  const ordersMap = await fetchCustomOrdersMap(orderIds);

  const byOrder: Record<string, QcPickedOrderCard> = {};
  const assignmentMeta: Record<string, QcAssignmentMeta> = {};

  rows.forEach((r: any) => {
    const assignmentId = String(r.assignment_id);
    const currentPicked = Number(pickedByAssignment[assignmentId] || 0);
    if (currentPicked <= 0) return;

    const oid = r.order_id as string;
    if (!ordersMap[oid]) return;

    if (!byOrder[oid]) {
      byOrder[oid] = {
        order_id: oid,
        order_number: ordersMap[oid]?.order_number || '',
        customer_name: ordersMap[oid]?.customer_name,
        picked_quantity: 0,
        total_quantity: 0,
        assignment_ids: [],
        approved_quantity: 0,
        rejected_quantity: 0,
        is_fully_qc: true,
        qc_status: 'pending',
        batch_avatars: [],
        batch_faces: [],
      };
    }

    byOrder[oid].picked_quantity += currentPicked;
    const lineAssigned =
      assignmentAssignedById[assignmentId] ??
      Math.max(Number(r.total_quantity || 0), sumAssignedFromSizeDistributions(r.size_distributions));
    byOrder[oid].total_quantity += lineAssigned;
    byOrder[oid].approved_quantity += Number(approvedByAssignment[assignmentId] || 0);
    byOrder[oid].rejected_quantity += Number(rejectedByAssignment[assignmentId] || 0);
    byOrder[oid].assignment_ids.push(assignmentId);

    if (!qcCompleteByAssignment[assignmentId]) {
      byOrder[oid].is_fully_qc = false;
    }

    const avatarUrl = r.batch_leader_avatar || r.batch_leader_avatar_url || null;

    assignmentMeta[assignmentId] = {
      order_id: oid,
      order_number: byOrder[oid].order_number,
      batch_name: r.batch_name,
      picked: currentPicked,
      approved: Number(approvedByAssignment[assignmentId] || 0),
      rejected: Number(rejectedByAssignment[assignmentId] || 0),
      batch_leader_name: r.batch_leader_name,
      batch_leader_avatar: avatarUrl,
    };

    const batchAvatars = byOrder[oid].batch_avatars!;
    const existingIndex = batchAvatars.findIndex((ba) => {
      if (r.batch_name && ba.batch_name === r.batch_name) return true;
      if (avatarUrl && ba.avatar_url === avatarUrl) return true;
      return false;
    });
    if (existingIndex === -1) {
      batchAvatars.push({
        avatar_url: avatarUrl || '',
        batch_name: r.batch_name || undefined,
        batch_leader_name: r.batch_leader_name || undefined,
      });
    }

    const faceName = String(r.batch_leader_name || '').trim();
    if (faceName && byOrder[oid].batch_faces) {
      const seen = new Set(byOrder[oid].batch_faces!.map((f) => f.name.toLowerCase()));
      if (!seen.has(faceName.toLowerCase())) {
        byOrder[oid].batch_faces!.push({ name: faceName, avatar: avatarUrl });
      }
    }
  });

  Object.values(byOrder).forEach((order) => {
    if (order.is_fully_qc) order.qc_status = 'completed';
    else if (order.approved_quantity > 0 || order.rejected_quantity > 0) order.qc_status = 'partial';
    else order.qc_status = 'pending';
  });

  return { orders: Object.values(byOrder), assignmentMeta };
}

/** Apply thumbnails after the list is visible (non-blocking second pass). */
export async function enrichQcOrdersWithImages(
  orders: QcPickedOrderCard[],
  ordersMap?: Record<string, OrderMeta>
): Promise<QcPickedOrderCard[]> {
  if (!orders.length) return orders;
  const orderIds = orders.map((o) => o.order_id);
  let meta = ordersMap;
  if (!meta) {
    meta = await fetchCustomOrdersMap(orderIds);
  }
  const { imageByOrder, categoryByOrder } = await resolveQcOrderThumbnails(orderIds, meta);
  return orders.map((o) => ({
    ...o,
    image_url: imageByOrder[o.order_id] ?? o.image_url,
    product_category: categoryByOrder[o.order_id] ?? o.product_category,
  }));
}
