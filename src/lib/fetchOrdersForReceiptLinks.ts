import { supabase } from '@/integrations/supabase/client';
import { chunkArray } from '@/lib/chunkArray';
import { shouldRetryReadWithoutIsDeletedFilter } from '@/lib/supabaseSoftDeleteCompat';

const ORDER_IN_CHUNK = 80;
const ORDER_SELECT_WITH_CUSTOMER = '*, customer:customers(company_name), order_type';
const ORDER_SELECT_BARE = '*';

export type ReceiptLinkedOrder = Record<string, unknown> & {
  id: string;
  order_number?: string;
  order_date?: string;
  is_deleted?: boolean;
};

function mergeOrders(target: Map<string, ReceiptLinkedOrder>, rows: ReceiptLinkedOrder[] | null | undefined) {
  for (const row of rows || []) {
    if (!row?.id || row.is_deleted) continue;
    target.set(String(row.id), row);
  }
}

async function fetchOrderBatch(
  column: 'id' | 'order_number',
  values: string[],
  select: string,
  withDeletedFilter: boolean,
  includeReadymade: boolean
): Promise<{ data: ReceiptLinkedOrder[] | null; error: unknown }> {
  let q = supabase
    .from('orders')
    .select(select)
    .neq('status', 'cancelled' as any)
    .in(column, values as any);

  if (!includeReadymade) {
    q = q.or('order_type.is.null,order_type.eq.custom');
  }

  if (withDeletedFilter) q = q.eq('is_deleted', false);

  const resp = await q;
  if (resp.error && withDeletedFilter && shouldRetryReadWithoutIsDeletedFilter(resp.error)) {
    const retry = await fetchOrderBatch(column, values, select, false, includeReadymade);
    if (retry.error) return retry;
    return {
      data: (retry.data || []).filter((o) => !o.is_deleted),
      error: null,
    };
  }
  return { data: (resp.data as ReceiptLinkedOrder[] | null) ?? null, error: resp.error };
}

async function fetchByColumn(
  column: 'id' | 'order_number',
  values: string[],
  select: string,
  includeReadymade: boolean
): Promise<ReceiptLinkedOrder[]> {
  const rows: ReceiptLinkedOrder[] = [];
  for (const batch of chunkArray(values, ORDER_IN_CHUNK)) {
    const { data, error } = await fetchOrderBatch(column, batch, select, true, includeReadymade);
    if (error) throw error;
    if (data?.length) rows.push(...data);
  }
  return rows;
}

/**
 * Load orders linked to active order receipts using chunked `.in()` queries
 * (avoids giant OR URLs and full-table scans).
 */
export async function fetchOrdersForReceiptLinks(
  orderIds: string[],
  orderNumbers: string[],
  options?: { includeReadymade?: boolean }
): Promise<ReceiptLinkedOrder[]> {
  const includeReadymade = options?.includeReadymade ?? false;
  const merged = new Map<string, ReceiptLinkedOrder>();
  const uniqueIds = [...new Set(orderIds.filter(Boolean))];
  const uniqueNumbers = [...new Set(orderNumbers.filter(Boolean))];

  let select = ORDER_SELECT_WITH_CUSTOMER;
  try {
    mergeOrders(merged, await fetchByColumn('id', uniqueIds, select, includeReadymade));
  } catch (primaryErr) {
    select = ORDER_SELECT_BARE;
    merged.clear();
    mergeOrders(merged, await fetchByColumn('id', uniqueIds, select, includeReadymade));
    if (!merged.size && primaryErr) {
      throw primaryErr;
    }
  }

  const coveredNumbers = new Set(
    Array.from(merged.values())
      .map((o) => String(o.order_number || '').trim())
      .filter(Boolean)
  );
  const numbersToFetch = uniqueNumbers.filter((n) => !coveredNumbers.has(n));
  mergeOrders(merged, await fetchByColumn('order_number', numbersToFetch, select, includeReadymade));

  return Array.from(merged.values()).sort((a, b) => {
    const aTime = new Date(String(a.order_date || 0)).getTime();
    const bTime = new Date(String(b.order_date || 0)).getTime();
    return bTime - aTime;
  });
}
