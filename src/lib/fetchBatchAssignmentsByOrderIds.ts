import { supabase } from '@/integrations/supabase/client';
import { chunkArray } from '@/lib/chunkArray';
import {
  resolveBatchLineAssignedQty,
  sumAssignedFromSizeDistributionRows,
} from '@/utils/batchAssignedQuantity';

const ORDER_IDS_IN_CHUNK = 80;

export type BatchSizeDistributionRow = {
  size_name: string;
  quantity: number;
  assigned_quantity?: number;
  picked_quantity: number;
  left_quantity: number;
};

export type OrderBatchAssignmentRow = Record<string, unknown> & {
  id: string;
  order_id: string;
  batch_id?: string;
  batch_name?: string;
  batch_code?: string;
  batch_leader_name?: string;
  batch_leader_avatar_url?: string;
  tailor_type?: string;
  total_quantity?: number;
  size_distributions: BatchSizeDistributionRow[];
};

function normalizeSizeDistributionsFromDb(raw: unknown): BatchSizeDistributionRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((d: any) => {
    const assigned = resolveBatchLineAssignedQty(d);
    const pickedQuantity = Number(d?.picked_quantity ?? 0);
    return {
      size_name: String(d?.size_name || ''),
      quantity: assigned,
      assigned_quantity: assigned,
      picked_quantity: pickedQuantity,
      left_quantity: Math.max(0, assigned - pickedQuantity),
    };
  });
}

function sumAssignedFromSizeDistributions(rows: BatchSizeDistributionRow[]): number {
  return sumAssignedFromSizeDistributionRows(rows);
}

function batchAssignmentRowId(row: { id?: string; assignment_id?: string } | null | undefined): string {
  return String(row?.id ?? row?.assignment_id ?? '').trim();
}

async function fetchAssignmentViewRows(orderIds: string[]): Promise<any[]> {
  const rows: any[] = [];
  for (const batch of chunkArray(orderIds, ORDER_IDS_IN_CHUNK)) {
    const { data, error } = await supabase
      .from('order_batch_assignments_with_details' as any)
      .select('*')
      .in('order_id', batch as any);

    if (error) throw error;
    if (data?.length) rows.push(...data);
  }
  return rows;
}

async function fetchAssignmentFallbackRows(orderIds: string[]): Promise<any[]> {
  const rows: any[] = [];
  for (const batch of chunkArray(orderIds, ORDER_IDS_IN_CHUNK)) {
    const { data, error } = await supabase
      .from('order_batch_assignments' as any)
      .select(
        `
        id,
        order_id,
        batch_id,
        total_quantity,
        order_batch_size_distributions (
          size_name,
          quantity,
          assigned_quantity,
          picked_quantity
        )
      `
      )
      .in('order_id', batch as any);

    if (error) throw error;
    if (data?.length) rows.push(...data);
  }
  return rows;
}

function enrichAssignmentRow(row: any): OrderBatchAssignmentRow | null {
  const orderId = String(row?.order_id || '').trim();
  if (!orderId) return null;

  const aid = batchAssignmentRowId(row);
  const dist = normalizeSizeDistributionsFromDb(
    row.size_distributions ?? row.order_batch_size_distributions
  );
  const viewTotal = Number(row.total_quantity || 0) || 0;
  const fromSizes = sumAssignedFromSizeDistributions(dist);
  const mergedTotal = Math.max(viewTotal, fromSizes);

  return {
    ...row,
    id: aid || String(row.id || ''),
    order_id: orderId,
    total_quantity: mergedTotal,
    size_distributions: dist,
  };
}

/** Bulk-load batch assignments for many orders (chunked; uses details view with fallback). */
export async function fetchBatchAssignmentsByOrderIds(
  orderIds: string[]
): Promise<Record<string, OrderBatchAssignmentRow[]>> {
  const uniqueIds = [...new Set(orderIds.filter(Boolean))];
  if (!uniqueIds.length) return {};

  let rawRows: any[] = [];
  try {
    rawRows = await fetchAssignmentViewRows(uniqueIds);
  } catch (viewError) {
    console.warn('[fetchBatchAssignmentsByOrderIds] view unavailable, using fallback', viewError);
  }

  if (!rawRows.length) {
    try {
      rawRows = await fetchAssignmentFallbackRows(uniqueIds);
    } catch (fallbackError) {
      console.error('[fetchBatchAssignmentsByOrderIds] fallback failed', fallbackError);
      return {};
    }
  }

  const byOrderId: Record<string, OrderBatchAssignmentRow[]> = {};
  for (const row of rawRows) {
    const enriched = enrichAssignmentRow(row);
    if (!enriched) continue;
    const oid = enriched.order_id;
    if (!byOrderId[oid]) byOrderId[oid] = [];
    byOrderId[oid].push(enriched);
  }

  return byOrderId;
}
