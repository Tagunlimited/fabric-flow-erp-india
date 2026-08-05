export type OrderSizeRow = { size: string; qty: number };

import type { SizeType } from '@/utils/sizeSorting';
import { sortSizesByMasterOrder } from '@/utils/sizeSorting';

export function normalizeSizesQuantities(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const size = String(k || '').trim();
    if (!size) continue;
    const q = Number(v);
    if (Number.isFinite(q) && q > 0) out[size] = q;
  }
  return out;
}

export function getAllowedSizesForType(
  sizeTypeId: string | null | undefined,
  sizeTypes: SizeType[]
): string[] {
  if (!sizeTypeId) return [];
  const sizeType = sizeTypes.find((st) => st.id === sizeTypeId);
  if (!sizeType || !Array.isArray(sizeType.available_sizes)) return [];
  const rawSizes = sizeType.available_sizes
    .map((size) => String(size || '').trim())
    .filter(Boolean);
  const uniqueSizes = Array.from(new Set(rawSizes));
  return sortSizesByMasterOrder(uniqueSizes, sizeTypeId, sizeTypes);
}

export function normalizeSizesByAllowed(
  value: unknown,
  allowedSizes: string[]
): Record<string, number> {
  const normalized = normalizeSizesQuantities(value);
  if (!allowedSizes.length) return {};
  const allowedSet = new Set(allowedSizes);
  return Object.fromEntries(
    Object.entries(normalized).filter(([size]) => allowedSet.has(size))
  ) as Record<string, number>;
}

export function buildEmptySizesForType(
  sizeTypeId: string | null | undefined,
  sizeTypes: SizeType[]
): Record<string, number> {
  const allowed = getAllowedSizesForType(sizeTypeId, sizeTypes);
  return Object.fromEntries(allowed.map((s) => [s, 0]));
}

export function sumSizesQuantities(sizes: Record<string, number>): number {
  return Object.values(sizes).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
}

export function sizesQuantitiesToRows(map: Record<string, number> | null | undefined): OrderSizeRow[] {
  if (!map) return [];
  return Object.entries(map)
    .filter(([, q]) => Number(q) > 0)
    .map(([size, qty]) => ({ size, qty: Number(qty) }));
}

export const OUTSOURCE_MANUAL_ENTRY_MODE = 'outsource_manual' as const;

export function isOutsourceManualPoLine(line: {
  entry_mode?: string | null;
  sizes_quantities?: Record<string, number> | null;
}): boolean {
  if (line.entry_mode === OUTSOURCE_MANUAL_ENTRY_MODE) return true;
  const sq = line.sizes_quantities;
  return !!sq && typeof sq === 'object' && Object.keys(sq).length > 0;
}

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
