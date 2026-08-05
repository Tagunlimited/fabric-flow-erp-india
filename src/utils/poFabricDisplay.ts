export type FabricCatalogRow = {
  id: string;
  fabric_name?: string | null;
  color?: string | null;
  gsm?: string | number | null;
  fabric_for_supplier?: string | null;
};

export type PoFabricLineInput = {
  item_type?: string | null;
  item_name?: string | null;
  fabric_name?: string | null;
  fabric_for_supplier?: string | null;
  fabric_id?: string | null;
  item_id?: string | null;
  fabric_color?: string | null;
  fabric_gsm?: string | number | null;
};

export type NormalizedPoFabricLine = {
  fabric_name: string | null;
  fabric_color: string | null;
  fabric_gsm: string | null;
  fabric_for_supplier: string | null;
  supplier_display_name: string;
};

function normText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normGsm(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s*gsm\s*/gi, '')
    .trim();
}

/** True when value looks like a GSM number, not a product/style label. */
export function looksLikeGsmValue(value: unknown): boolean {
  const v = normGsm(value);
  return /^\d+(\.\d+)?$/.test(v);
}

function findCatalogRow(
  item: PoFabricLineInput,
  fabricCatalog: FabricCatalogRow[]
): FabricCatalogRow | undefined {
  const catalog = fabricCatalog || [];
  const candidateIds = [item.fabric_id, item.item_id].filter(Boolean).map(String);
  for (const id of candidateIds) {
    const row = catalog.find((f) => String(f.id) === id);
    if (row) return row;
  }

  const fabricName = String(item.fabric_name || '').trim();
  if (!fabricName) return undefined;

  const color = normText(item.fabric_color);
  const gsm = normGsm(item.fabric_gsm);

  const exact = catalog.find((f) => {
    if (normText(f.fabric_name) !== normText(fabricName)) return false;
    if (color && normText(f.color) !== color) return false;
    if (gsm && looksLikeGsmValue(gsm) && normGsm(f.gsm) !== gsm) return false;
    return true;
  });
  if (exact) return exact;

  return catalog.find((f) => normText(f.fabric_name) === normText(fabricName));
}

function sanitizeGsm(
  lineGsm: unknown,
  catalogGsm: unknown
): string | null {
  if (looksLikeGsmValue(lineGsm)) return normGsm(lineGsm);
  if (looksLikeGsmValue(catalogGsm)) return normGsm(catalogGsm);
  return null;
}

/**
 * Normalize fabric PO line fields from BOM/pending/saved data + fabric_master catalog.
 * Never treats BOM product labels (e.g. "RI - Advance - Formal Pant") as fabric GSM.
 */
export function normalizePoFabricLine(
  line: PoFabricLineInput,
  fabricCatalog: FabricCatalogRow[]
): NormalizedPoFabricLine | null {
  if (String(line.item_type || '').toLowerCase() !== 'fabric') return null;

  const catalogRow = findCatalogRow(line, fabricCatalog);

  const fabric_name =
    String(line.fabric_name || catalogRow?.fabric_name || '').trim() || null;
  const fabric_color =
    String(line.fabric_color || catalogRow?.color || '').trim() || null;
  const fabric_gsm = sanitizeGsm(line.fabric_gsm, catalogRow?.gsm);

  const fabric_for_supplier =
    resolveFabricForSupplierName(
      {
        item_type: 'fabric',
        fabric_for_supplier: line.fabric_for_supplier,
        fabric_id: line.fabric_id,
        item_id: line.item_id,
        fabric_name,
        fabric_color,
        fabric_gsm,
      },
      fabricCatalog
    ) || String(catalogRow?.fabric_for_supplier || '').trim() || null;

  const supplier_display_name =
    fabric_for_supplier || fabric_name || String(line.item_name || '').trim() || '—';

  return {
    fabric_name,
    fabric_color,
    fabric_gsm,
    fabric_for_supplier,
    supplier_display_name,
  };
}

/** Resolve supplier-facing fabric label from line + fabric_master catalog. */
export function resolveFabricForSupplierName(
  item: PoFabricLineInput,
  fabricCatalog: FabricCatalogRow[]
): string | null {
  if (String(item.item_type || '').toLowerCase() !== 'fabric') return null;

  const direct = String(item.fabric_for_supplier || '').trim();
  if (direct) return direct;

  const catalogRow = findCatalogRow(item, fabricCatalog);
  const fromCatalog = String(catalogRow?.fabric_for_supplier || '').trim();
  if (fromCatalog) return fromCatalog;

  return null;
}

/** Item column on purchase orders: prefer Fabric for Supplier, else fabric name. */
export function purchaseOrderLineItemDisplayName(
  item: PoFabricLineInput,
  fabricCatalog: FabricCatalogRow[]
): string {
  if (String(item.item_type || '').toLowerCase() === 'fabric') {
    const normalized = normalizePoFabricLine(item, fabricCatalog);
    if (normalized) return normalized.supplier_display_name;
    return '—';
  }
  return String(item.item_name || '').trim() || 'N/A';
}

/** GSM column for fabric PO lines. */
export function purchaseOrderFabricGsmDisplay(
  item: PoFabricLineInput,
  fabricCatalog: FabricCatalogRow[]
): string {
  if (String(item.item_type || '').toLowerCase() !== 'fabric') return '-';
  const normalized = normalizePoFabricLine(item, fabricCatalog);
  const gsm = normalized?.fabric_gsm;
  return gsm ? gsm : 'N/A';
}
