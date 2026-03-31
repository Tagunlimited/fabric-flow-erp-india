/** Size breakdown for one order line (from JSON fields or single size + quantity). */
export function sizesFromOrderItem(item: any): { size_name: string; total_quantity: number }[] {
  const normalizeMap = (source: Record<string, unknown> | null | undefined) => {
    const map = new Map<string, number>();
    if (!source || typeof source !== 'object') return map;
    Object.entries(source).forEach(([size, qty]) => {
      const s = String(size || '').trim();
      if (!s) return;
      const q = Number(qty) || 0;
      if (q <= 0) return;
      map.set(s, q);
    });
    return map;
  };

  const asRows = (map: Map<string, number>) =>
    Array.from(map.entries())
      .map(([size_name, total_quantity]) => ({
        size_name,
        total_quantity,
      }))
      .filter((row) => Number(row.total_quantity) > 0);

  const addSingle = (size: string, qty: unknown) => {
    const s = String(size || '').trim();
    if (!s) return [] as { size_name: string; total_quantity: number }[];
    const q = Number(qty) || 0;
    if (q <= 0) return [] as { size_name: string; total_quantity: number }[];
    return [{ size_name: s, total_quantity: q }];
  };

  // IMPORTANT:
  // Do not sum across multiple sources, because the same distribution may be duplicated
  // in both `sizes_quantities` and `specifications.sizes_quantities`.
  // Use precedence: item.sizes_quantities -> specifications.sizes_quantities -> single size field.
  const directSizes = normalizeMap(item?.sizes_quantities);
  if (directSizes.size > 0) return asRows(directSizes);

  let specs = item?.specifications;
  if (typeof specs === 'string') {
    try {
      specs = JSON.parse(specs);
    } catch {
      specs = null;
    }
  }
  const specSizes = normalizeMap(specs?.sizes_quantities);
  if (specSizes.size > 0) return asRows(specSizes);

  if (item?.size_name != null && item?.quantity != null) {
    return addSingle(String(item.size_name), item.quantity);
  }

  return [];
}
