import { supabase } from '@/integrations/supabase/client';

export type StockProductRow = {
  id: string;
  sku?: string | null;
  name?: string | null;
  class?: string | null;
  size?: string | null;
  color?: string | null;
  category?: string | null;
  current_stock?: number | null;
};

export type WarehouseStockRow = {
  id: string;
  quantity: number;
  item_name: string | null;
  status?: string | null;
  bin_code?: string | null;
};

/** Listed products from product master (same fields as Product Inventory). */
export async function fetchStockProductCatalog(): Promise<StockProductRow[]> {
  const { data, error } = await supabase
    .from('product_master')
    .select('id, sku, name, class, size, color, category, current_stock')
    .order('name', { ascending: true });

  if (error) throw error;
  return (data as StockProductRow[]) || [];
}

/** Warehouse bins for a product master SKU (build-to-stock fulfillment). */
export async function fetchWarehouseStockForProduct(productMasterId: string): Promise<WarehouseStockRow[]> {
  const { data, error } = await supabase
    .from('warehouse_inventory')
    .select(
      `
      id,
      quantity,
      item_name,
      status,
      bin:bin_id ( bin_code )
    `
    )
    .eq('item_type', 'PRODUCT')
    .eq('item_id', productMasterId)
    .in('status', ['IN_STORAGE', 'READY_TO_DISPATCH'] as any)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data as any[]) || []).map((row) => ({
    id: String(row.id),
    quantity: Number(row.quantity) || 0,
    item_name: row.item_name ?? null,
    status: row.status ?? null,
    bin_code: row.bin?.bin_code ?? null,
  }));
}

export function stockProductLabel(p: StockProductRow): string {
  const parts = [
    p.sku,
    p.name || p.class,
    p.size ? `Size ${p.size}` : null,
    p.color,
  ].filter(Boolean);
  return parts.join(' · ') || p.id;
}

/** Prefer SKUs whose master size matches the order size label. */
export function sortCatalogForOrderSize(catalog: StockProductRow[], orderSize: string): StockProductRow[] {
  const norm = orderSize.trim().toLowerCase();
  if (!norm || norm === 'total') return [...catalog];
  return [...catalog].sort((a, b) => {
    const aMatch = String(a.size || '').trim().toLowerCase() === norm ? 0 : 1;
    const bMatch = String(b.size || '').trim().toLowerCase() === norm ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return stockProductLabel(a).localeCompare(stockProductLabel(b));
  });
}
