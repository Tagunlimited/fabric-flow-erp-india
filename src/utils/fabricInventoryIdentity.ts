export function normalizeUnit(unit: string | null | undefined): string {
  const raw = String(unit || '').trim().toLowerCase();
  if (!raw) return 'kg';
  if (['kg', 'kgs', 'kilogram', 'kilograms'].includes(raw)) return 'kg';
  if (['g', 'gm', 'gms', 'gram', 'grams'].includes(raw)) return 'g';
  if (['m', 'meter', 'meters', 'metre', 'metres'].includes(raw)) return 'm';
  return raw;
}

export function sameUnitFamily(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeUnit(a) === normalizeUnit(b);
}

export function resolveWarehouseFabricId(
  row: { item_id?: string | null; grn_item_po_item_id?: string | null },
  poFabricByPoItemId: Map<string, string>
): string | null {
  const direct = String(row.item_id || '').trim();
  if (direct) return direct;
  const poItemId = String(row.grn_item_po_item_id || '').trim();
  if (!poItemId) return null;
  return poFabricByPoItemId.get(poItemId) || null;
}

export function normalizeText(v: string | null | undefined): string {
  return String(v || '').trim().toLowerCase();
}
