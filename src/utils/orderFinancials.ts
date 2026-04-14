import { supabase } from '@/integrations/supabase/client';
import { calculateOrderSummary } from '@/utils/priceCalculation';
import { shouldRetryReadWithoutIsDeletedFilter } from '@/lib/supabaseSoftDeleteCompat';

let orderAdditionalChargesAvailable: boolean | null = null;

export function isMissingRelationError(err: unknown): boolean {
  const e = err as { message?: string; details?: string } | null;
  const msg = String(e?.message || '').toLowerCase();
  const details = String(e?.details || '').toLowerCase();
  return (
    msg.includes('relation') ||
    msg.includes('does not exist') ||
    msg.includes('not found') ||
    details.includes('relation') ||
    details.includes('does not exist')
  );
}

export async function safeFetchOrderAdditionalCharges(
  orderId: string
): Promise<Array<{ amount_incl_gst?: number }>> {
  if (orderAdditionalChargesAvailable === false) return [];
  const { data, error } = await supabase
    .from('order_additional_charges')
    .select('amount_incl_gst')
    .eq('order_id', orderId);

  if (error) {
    if (isMissingRelationError(error)) {
      orderAdditionalChargesAvailable = false;
      return [];
    }
    console.warn('order_additional_charges fetch error:', error);
    return [];
  }

  orderAdditionalChargesAvailable = true;
  return (data || []) as Array<{ amount_incl_gst?: number }>;
}

export function receiptRowIsCancelled(r: { status?: string | null }): boolean {
  return String(r.status || 'active').toLowerCase() === 'cancelled';
}

/** Matches InvoicePage credit detection: ₹0 + Credit mode/type; excludes cancelled receipts. */
export function isCreditReceiptRow(r: {
  amount?: number | null;
  payment_mode?: string | null;
  payment_type?: string | null;
  status?: string | null;
}): boolean {
  if (receiptRowIsCancelled(r)) return false;
  const amt = Number(r.amount ?? 0);
  if (amt !== 0) return false;
  return r.payment_type === 'Credit' || r.payment_mode === 'Credit';
}

/** Order IDs that have at least one active credit acknowledgement receipt. */
export async function fetchOrderIdsWithActiveCreditReceipt(orderIds: string[]): Promise<Set<string>> {
  if (orderIds.length === 0) return new Set();
  const sel = 'reference_id, amount, payment_mode, payment_type, status';
  let { data, error } = await supabase
    .from('receipts')
    .select(sel)
    .eq('is_deleted', false)
    .eq('reference_type', 'order')
    .in('reference_id', orderIds as any);
  if (error && shouldRetryReadWithoutIsDeletedFilter(error)) {
    const r2 = await supabase.from('receipts').select(sel).eq('reference_type', 'order').in('reference_id', orderIds as any);
    data = r2.data;
    error = r2.error;
  }
  if (error || !data) return new Set();
  const set = new Set<string>();
  for (const row of data as any[]) {
    if (row.reference_id && isCreditReceiptRow(row)) set.add(row.reference_id);
  }
  return set;
}

/** Sum receipt amounts excluding cancelled rows (any reference match). */
export function sumActiveReceiptAmounts(rows: Array<{ amount?: number | null; status?: string | null }>): number {
  return (rows || []).reduce((sum, r) => {
    if (receiptRowIsCancelled(r)) return sum;
    return sum + Number(r.amount || 0);
  }, 0);
}

/** Receipts linked to an order by `reference_id` or legacy `reference_number`. */
export function sumActiveReceiptAmountsForOrder(
  rows: Array<{
    reference_id?: string | null;
    reference_number?: string | null;
    amount?: number | null;
    status?: string | null;
  }>,
  orderId: string,
  orderNumber: string
): number {
  return (rows || []).reduce((sum, r) => {
    const match = r.reference_id === orderId || r.reference_number === orderNumber;
    if (!match) return sum;
    if (receiptRowIsCancelled(r)) return sum;
    return sum + Number(r.amount || 0);
  }, 0);
}

export function orderHasActiveCreditInReceiptRows(
  rows: Array<{
    reference_id?: string | null;
    reference_number?: string | null;
    amount?: number | null;
    payment_mode?: string | null;
    payment_type?: string | null;
    status?: string | null;
  }>,
  orderId: string,
  orderNumber: string
): boolean {
  return (rows || []).some((r) => {
    const match = r.reference_id === orderId || r.reference_number === orderNumber;
    return match && isCreditReceiptRow(r);
  });
}

/**
 * Order total from line items + additional charges; receipts sum excludes cancelled rows.
 * Aligns with quotation / order detail when additional charges exist.
 */
export async function getOrderCalculatedTotals(
  orderId: string,
  _orderNumber?: string
): Promise<{ calculatedTotal: number; totalReceipts: number; pendingAmount: number }> {
  const orderBase = () =>
    supabase.from('orders').select('id, final_amount, gst_rate').eq('id', orderId);

  let { data: order, error: orderError } = await orderBase().eq('is_deleted', false).single();
  if (orderError && shouldRetryReadWithoutIsDeletedFilter(orderError)) {
    const retry = await orderBase().single();
    order = retry.data;
    orderError = retry.error;
  }

  let { data: orderItems, error: itemsError } = await supabase
    .from('order_items')
    .select('*, size_prices, sizes_quantities, specifications')
    .eq('is_deleted', false)
    .eq('order_id', orderId);
  if (itemsError && shouldRetryReadWithoutIsDeletedFilter(itemsError)) {
    const retry = await supabase
      .from('order_items')
      .select('*, size_prices, sizes_quantities, specifications')
      .eq('order_id', orderId);
    orderItems = retry.data;
    itemsError = retry.error;
  }

  let { data: existingReceipts, error: receiptsError } = await supabase
    .from('receipts')
    .select('amount, status')
    .eq('is_deleted', false)
    .eq('reference_id', orderId)
    .eq('reference_type', 'order');
  if (receiptsError && shouldRetryReadWithoutIsDeletedFilter(receiptsError)) {
    const retry = await supabase
      .from('receipts')
      .select('amount, status')
      .eq('reference_id', orderId)
      .eq('reference_type', 'order');
    existingReceipts = retry.data;
    receiptsError = retry.error;
  }

  const additionalCharges = await safeFetchOrderAdditionalCharges(orderId);

  let calculatedTotal = order?.final_amount ?? 0;
  if (orderItems && orderItems.length > 0 && order) {
    const summary = calculateOrderSummary(orderItems, order);
    calculatedTotal = summary.grandTotal;
  }
  const additionalTotal = (additionalCharges || []).reduce(
    (s, c) => s + Number((c as { amount_incl_gst?: number }).amount_incl_gst || 0),
    0
  );
  calculatedTotal += additionalTotal;

  const totalReceipts = sumActiveReceiptAmounts(existingReceipts || []);
  const pendingAmount = Math.max(0, calculatedTotal - totalReceipts);
  return { calculatedTotal, totalReceipts, pendingAmount };
}
