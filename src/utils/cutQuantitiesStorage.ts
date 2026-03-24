/**
 * order_assignments.cut_quantities_by_size:
 * - Legacy: { "XS": 5, "S": 10 } (flat size -> qty, whole order)
 * - New: { "by_order_item": { "<order_item_id>": { "XS": 5 } } }
 */

export type CutQuantitiesBySizeStored =
  | Record<string, number>
  | { by_order_item: Record<string, Record<string, number>> };

export function sumAllCutsInStoredJson(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0;
  const o = raw as Record<string, unknown>;
  if (o.by_order_item && typeof o.by_order_item === 'object') {
    let sum = 0;
    for (const inner of Object.values(o.by_order_item as Record<string, unknown>)) {
      if (inner && typeof inner === 'object') {
        for (const v of Object.values(inner as Record<string, unknown>)) {
          sum += Number(v) || 0;
        }
      }
    }
    return sum;
  }
  return Object.entries(o).reduce((s, [k, v]) => {
    if (k === 'by_order_item') return s;
    return s + (typeof v === 'number' ? Number(v) : 0);
  }, 0);
}

/** Normalize stored JSON to per–order-item maps (fills every item id with an object, possibly empty). */
export function normalizeToByOrderItem(
  raw: unknown,
  orderItemIds: string[]
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  orderItemIds.forEach(id => {
    out[id] = {};
  });
  if (!raw || typeof raw !== 'object' || orderItemIds.length === 0) return out;

  const o = raw as Record<string, unknown>;

  if (o.by_order_item && typeof o.by_order_item === 'object') {
    for (const id of orderItemIds) {
      const inner = (o.by_order_item as Record<string, unknown>)[id];
      if (inner && typeof inner === 'object') {
        out[id] = {};
        for (const [sk, sv] of Object.entries(inner as Record<string, unknown>)) {
          out[id][sk] = Number(sv) || 0;
        }
      }
    }
    return out;
  }

  const flat: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'number' && k !== 'by_order_item') {
      flat[k] = v;
    }
  }

  if (Object.keys(flat).length === 0) return out;

  if (orderItemIds.length === 1) {
    out[orderItemIds[0]] = { ...flat };
  } else {
    // Ambiguous legacy multi-line order: attribute flat map to first line (previous UI merged sizes)
    out[orderItemIds[0]] = { ...flat };
  }
  return out;
}

export function buildStoredPayloadFromByOrderItem(
  byOrderItem: Record<string, Record<string, number>>
): { by_order_item: Record<string, Record<string, number>> } {
  const cleaned: Record<string, Record<string, number>> = {};
  for (const [itemId, sizes] of Object.entries(byOrderItem)) {
    const inner: Record<string, number> = {};
    for (const [sz, q] of Object.entries(sizes || {})) {
      const n = Number(q) || 0;
      if (n > 0) inner[sz] = n;
    }
    cleaned[itemId] = inner;
  }
  return { by_order_item: cleaned };
}
