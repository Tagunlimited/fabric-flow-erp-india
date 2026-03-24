/** Size breakdown for one order line (from JSON fields or single size + quantity). */
export function sizesFromOrderItem(item: any): { size_name: string; total_quantity: number }[] {
  const map = new Map<string, number>();
  const add = (size: string, qty: unknown) => {
    const s = String(size || '').trim();
    if (!s) return;
    const q = Number(qty) || 0;
    if (q <= 0) return;
    map.set(s, (map.get(s) || 0) + q);
  };

  if (item?.sizes_quantities && typeof item.sizes_quantities === 'object') {
    Object.entries(item.sizes_quantities).forEach(([s, q]) => add(s, q));
  }

  let specs = item?.specifications;
  if (typeof specs === 'string') {
    try {
      specs = JSON.parse(specs);
    } catch {
      specs = null;
    }
  }
  if (specs?.sizes_quantities && typeof specs.sizes_quantities === 'object') {
    Object.entries(specs.sizes_quantities).forEach(([s, q]) => add(s, q));
  }

  if (item?.size_name != null && item?.quantity != null) {
    add(String(item.size_name), item.quantity);
  }

  return Array.from(map.entries())
    .map(([size_name, total_quantity]) => ({
      size_name,
      total_quantity,
    }))
    .filter((row) => Number(row.total_quantity) > 0);
}
