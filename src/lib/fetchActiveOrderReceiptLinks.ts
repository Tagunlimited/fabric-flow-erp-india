import { supabase } from '@/integrations/supabase/client';
import { shouldRetryReadWithoutIsDeletedFilter } from '@/lib/supabaseSoftDeleteCompat';

export interface OrderReceiptLink {
  reference_id: string | null;
  reference_number: string | null;
  reference_type?: string | null;
  status?: string | null;
}

const RECEIPTS_PAGE_SIZE = 1000;

/** Active order receipts only — cancelled rows are excluded. */
export function isActiveOrderReceipt(row: OrderReceiptLink): boolean {
  const referenceType = String(row.reference_type || '').trim().toLowerCase();
  const status = String(row.status || 'active').trim().toLowerCase();
  const hasLink = !!(row.reference_id || String(row.reference_number || '').trim());
  return referenceType === 'order' && status !== 'cancelled' && hasLink;
}

async function fetchOrderReceiptPage(
  from: number,
  to: number,
  withDeletedFilter: boolean
): Promise<{ data: OrderReceiptLink[] | null; error: unknown }> {
  let query = supabase
    .from('receipts')
    .select('reference_id, reference_number, reference_type, status')
    .or('reference_type.eq.order,reference_type.eq.ORDER')
    .order('created_at', { ascending: false })
    .range(from, to);

  if (withDeletedFilter) {
    query = query.eq('is_deleted', false);
  }

  return query;
}

/**
 * Load every order-linked receipt row (paginated past PostgREST's 1000-row default cap).
 */
export async function fetchAllActiveOrderReceiptLinks(): Promise<OrderReceiptLink[]> {
  const rows: OrderReceiptLink[] = [];
  let from = 0;

  while (true) {
    const to = from + RECEIPTS_PAGE_SIZE - 1;
    let { data, error } = await fetchOrderReceiptPage(from, to, true);

    if (error && shouldRetryReadWithoutIsDeletedFilter(error)) {
      const retry = await fetchOrderReceiptPage(from, to, false);
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;

    const page = (data || []) as OrderReceiptLink[];
    if (!page.length) break;

    rows.push(...page);
    if (page.length < RECEIPTS_PAGE_SIZE) break;
    from += RECEIPTS_PAGE_SIZE;
  }

  return rows.filter(isActiveOrderReceipt);
}
