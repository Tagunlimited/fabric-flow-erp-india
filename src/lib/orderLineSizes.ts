export type OrderSizeRow = { size: string; qty: number };

export function parseOrderLineSpecifications(spec: unknown): Record<string, unknown> {
  if (spec == null) return {};
  if (typeof spec === 'string') {
    try {
      const o = JSON.parse(spec);
      return typeof o === 'object' && o !== null ? (o as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof spec === 'object') return spec as Record<string, unknown>;
  return {};
}

function sizeRowsFromQuantitiesMap(source: Record<string, unknown> | null | undefined): OrderSizeRow[] {
  const rows: OrderSizeRow[] = [];
  if (!source || typeof source !== 'object') return rows;
  for (const [k, v] of Object.entries(source)) {
    const size = String(k || '').trim();
    if (!size) continue;
    const q = Number(v);
    if (q > 0) rows.push({ size, qty: q });
  }
  return rows;
}

/**
 * Size breakdown for fulfillment mapping.
 * Precedence matches {@link sizesFromOrderItem}: column `sizes_quantities` → specs → single Total row.
 */
export function getOrderLineSizeRows(
  specs: Record<string, unknown>,
  lineQuantity: number | null | undefined,
  directSizesQuantities?: Record<string, unknown> | null
): OrderSizeRow[] {
  const fromColumn = sizeRowsFromQuantitiesMap(directSizesQuantities ?? undefined);
  if (fromColumn.length > 0) return fromColumn;

  const fromSpecs = sizeRowsFromQuantitiesMap(specs.sizes_quantities as Record<string, unknown> | undefined);
  if (fromSpecs.length > 0) return fromSpecs;

  const explicit = String(specs.size || '').trim();
  const qty = Number(lineQuantity ?? specs.quantity ?? 0) || 1;
  return [{ size: explicit || 'Total', qty }];
}
