import { supabase } from '@/integrations/supabase/client';
import { shouldRetryReadWithoutIsDeletedFilter } from '@/lib/supabaseSoftDeleteCompat';
import { chunkArray } from '@/lib/chunkArray';

const ORDER_ITEMS_IN_CHUNK = 100;

/** Fetch order_items for many orders without exceeding PostgREST `.in()` limits. */
export async function fetchOrderItemsByOrderIds(
  orderIds: string[],
  select: string
): Promise<{ data: any[]; error: Error | null }> {
  const uniqueIds = [...new Set(orderIds.filter(Boolean))];
  if (!uniqueIds.length) return { data: [], error: null };

  const rows: any[] = [];
  for (const batch of chunkArray(uniqueIds, ORDER_ITEMS_IN_CHUNK)) {
    let result = await supabase
      .from('order_items')
      .select(select)
      .eq('is_deleted', false)
      .in('order_id', batch as any);

    if (result.error && shouldRetryReadWithoutIsDeletedFilter(result.error)) {
      result = await supabase.from('order_items').select(select).in('order_id', batch as any);
    }

    if (result.error) {
      return { data: rows, error: result.error as Error };
    }
    if (result.data?.length) rows.push(...result.data);
  }

  return { data: rows, error: null };
}
