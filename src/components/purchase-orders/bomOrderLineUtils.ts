/** Nested `order_items` shape for Supabase when loading BOM context from an order */
export const BOM_ORDER_ITEMS_SELECT =
  'id, product_id, quantity, unit_price, total_price, product_description, category_image_url, mockup_images, specifications, fabric_id, gsm, color, created_at, product_category_id, product_category:product_categories(category_name), fabric:fabric_master(id, fabric_name, color, gsm, fabric_for_supplier)';

/**
 * Free-text from `order_items.product_description` (internal / customer-facing line text).
 * This is **not** the Order form control labeled “Product”, which selects fabric (`fabric_master.fabric_name`).
 */
export function orderLineProductDropdownOnly(line: any): string {
  if (!line) return '';
  return String(line.product_description ?? '').trim();
}

/** Same value as the Order form “Product” dropdown: `fabric_master.fabric_name` on the line’s fabric embed. */
export function orderLineOrderFormProductFabricName(line: any): string {
  if (!line) return '';
  return String(line.fabric?.fabric_name ?? '').trim();
}

/** Product line label: description + category when both exist (e.g. "Taiwan – Jacket"). */
export function orderLineDisplayName(line: any): string {
  if (!line) return '';
  const cat = line.product_category?.category_name?.trim() || '';
  const desc = (
    line.product_description ||
    line.product?.product_name ||
    line.product?.name ||
    ''
  ).trim();
  if (cat && desc) {
    const d = desc.toLowerCase();
    const c = cat.toLowerCase();
    if (d === c) return desc;
    if (d.includes(c) && desc.length > cat.length) return desc;
    if (c.includes(d) && cat.length >= desc.length) return cat;
    return `${desc} – ${cat}`;
  }
  return desc || cat;
}

function normalizeGsmDisplay(gsm: string): string {
  const g = (gsm || '').trim();
  if (!g) return '';
  if (/\d/.test(g) && !/gsm/i.test(g)) return `${g} GSM`;
  return g;
}

function lineColorAndGsm(line: any): { color: string; gsm: string } {
  const f = line?.fabric;
  const color = String(f?.color ?? line?.color ?? '').trim();
  const gsmRaw = String(f?.gsm ?? line?.gsm ?? '').trim();
  return { color, gsm: normalizeGsmDisplay(gsmRaw) };
}

/**
 * “Fabric on order”: fabric chosen on the order (same base as the Order form “Product” dropdown) plus color/GSM.
 * Example: `SCUBA - Beige - 300 GSM`. Does not lead with `product_description` when a fabric row is present.
 */
export function orderLineFabricFromOrder(line: any): string {
  if (!line) return '';
  const { color, gsm } = lineColorAndGsm(line);
  const fabricName = orderLineOrderFormProductFabricName(line);
  if (fabricName) {
    return [fabricName, color, gsm].filter(Boolean).join(' - ');
  }
  const f = line.fabric;
  if (f) {
    const supplier = String(f.fabric_for_supplier ?? '').trim();
    if (supplier) return [supplier, color, gsm].filter(Boolean).join(' - ');
    return [color, gsm].filter(Boolean).join(' - ');
  }
  const base =
    orderLineDisplayName(line).trim() || orderLineProductDropdownOnly(line).trim();
  if (base) return [base, color, gsm].filter(Boolean).join(' - ');
  return [color, gsm].filter(Boolean).join(' - ');
}

/**
 * BOM grey “Product:” line, Fabric table “Product” column, and line-picker title: Order form “Product” (fabric) first.
 */
export function orderLineBomProductColumnLabel(line: any): string {
  if (!line) return '';
  const fabricName = orderLineOrderFormProductFabricName(line);
  if (fabricName) return fabricName;
  const supplier = String(line.fabric?.fabric_for_supplier ?? '').trim();
  if (supplier) return supplier;
  const fromDropdown = orderLineProductDropdownOnly(line).trim();
  if (fromDropdown) return fromDropdown;
  return orderLineDisplayName(line).trim();
}

/** Color + GSM only (for secondary text when the title is {@link orderLineBomProductColumnLabel}). */
export function orderLineFabricColorGsmSuffix(line: any): string {
  if (!line) return '';
  const { color, gsm } = lineColorAndGsm(line);
  return [color, gsm].filter(Boolean).join(' - ');
}

export function sortOrderLines<T extends { id: string; created_at?: string | null }>(lines: T[]): T[] {
  return [...(lines || [])].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function lineProductIndex(sortedLines: { id: string }[], lineId: string): number {
  const i = sortedLines.findIndex(l => l.id === lineId);
  return i >= 0 ? i + 1 : 1;
}

export function bomNumberForOrderLine(
  orderNumber: string,
  sortedLines: { id: string }[],
  lineId: string
): string {
  return `BOM-${orderNumber}-P${lineProductIndex(sortedLines, lineId)}`;
}

/**
 * Quantity for a new PO line from a BOM row. Prefer explicit `to_order` when present (including 0).
 * Otherwise use `qty_total` / `quantity`. Fixes `qty_total || to_order`, which ignores `to_order === 0`.
 */
export function getBomLinePoQuantity(item: Record<string, unknown> | null | undefined): number {
  if (!item || typeof item !== 'object') return 0;
  const raw = item['to_order'];
  const hasExplicit =
    raw !== undefined &&
    raw !== null &&
    raw !== '' &&
    !(typeof raw === 'number' && Number.isNaN(raw));
  if (hasExplicit) {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  const fallback = item['qty_total'] ?? item['quantity'];
  const n = Number(fallback);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** Remaining to buy after warehouse allocations on the BOM line and quantities already on POs. */
export function remainingQtyForNewPurchaseOrderLine(params: {
  qtyTotal: number;
  inventoryAllocated: number;
  totalOrderedOnPurchaseOrders: number;
}): number {
  const q = Math.max(0, Number(params.qtyTotal) || 0);
  const a = Math.max(0, Number(params.inventoryAllocated) || 0);
  const p = Math.max(0, Number(params.totalOrderedOnPurchaseOrders) || 0);
  return Math.max(0, q - a - p);
}
