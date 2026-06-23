import { supabase } from '@/integrations/supabase/client';

/** Recompute orders.status for a sales order (no-op if RPC is unavailable). */
export async function recalcOrderStatus(orderId: string | null | undefined): Promise<void> {
  const id = String(orderId || '').trim();
  if (!id) return;
  try {
    const { error } = await supabase.rpc('recalc_order_status' as any, { p_order_id: id });
    if (error) console.warn('recalc_order_status failed', error);
  } catch (e) {
    console.warn('recalc_order_status unavailable', e);
  }
}
