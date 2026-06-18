import { supabase } from '@/integrations/supabase/client';

export type OrderNumberPrefix = 'TUC' | 'RMO';

export async function allocateOrderNumber(prefix: OrderNumberPrefix): Promise<string> {
  const { data, error } = await supabase.rpc('allocate_order_number' as any, { p_prefix: prefix });
  if (error) throw error;
  const orderNumber = String(data || '').trim();
  if (!orderNumber) {
    throw new Error('allocate_order_number returned empty result');
  }
  return orderNumber;
}

export async function findOrderByCreateIdempotencyKey(idempotencyKey: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('create_idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}
