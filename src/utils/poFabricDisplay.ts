export type FabricCatalogRow = {
  id: string;
  fabric_name?: string | null;
  color?: string | null;
  gsm?: string | number | null;
  fabric_for_supplier?: string | null;
};

function normText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normGsm(value: unknown): string {
  return String(value ?? '').trim();
}

/** Resolve supplier-facing fabric label from line + fabric_master catalog. */
export function resolveFabricForSupplierName(
  item: {
    item_type?: string | null;
    fabric_for_supplier?: string | null;
    fabric_id?: string | null;
    item_id?: string | null;
    fabric_name?: string | null;
    fabric_color?: string | null;
    fabric_gsm?: string | number | null;
    item_name?: string | null;
  },
  fabricCatalog: FabricCatalogRow[]
): string | null {
  if (String(item.item_type || '').toLowerCase() !== 'fabric') return null;

  const direct = String(item.fabric_for_supplier || '').trim();
  if (direct) return direct;

  const catalog = fabricCatalog || [];
  const candidateIds = [item.fabric_id, item.item_id].filter(Boolean).map(String);
  for (const id of candidateIds) {
    const row = catalog.find((f) => String(f.id) === id);
    const supplier = String(row?.fabric_for_supplier || '').trim();
    if (supplier) return supplier;
  }

  const fabricName = String(item.fabric_name || item.item_name || '').trim();
  if (!fabricName) return null;

  const color = normText(item.fabric_color);
  const gsm = normGsm(item.fabric_gsm);

  const exact = catalog.find((f) => {
    if (normText(f.fabric_name) !== normText(fabricName)) return false;
    if (color && normText(f.color) !== color) return false;
    if (gsm && normGsm(f.gsm) !== gsm) return false;
    return true;
  });
  const exactSupplier = String(exact?.fabric_for_supplier || '').trim();
  if (exactSupplier) return exactSupplier;

  const byName = catalog.find((f) => normText(f.fabric_name) === normText(fabricName));
  const byNameSupplier = String(byName?.fabric_for_supplier || '').trim();
  if (byNameSupplier) return byNameSupplier;

  return null;
}

/** Item column on purchase orders: prefer Fabric for Supplier, else saved fabric / item name. */
export function purchaseOrderLineItemDisplayName(
  item: {
    item_type?: string | null;
    item_name?: string | null;
    fabric_for_supplier?: string | null;
    fabric_id?: string | null;
    item_id?: string | null;
    fabric_name?: string | null;
    fabric_color?: string | null;
    fabric_gsm?: string | number | null;
  },
  fabricCatalog: FabricCatalogRow[]
): string {
  if (String(item.item_type || '').toLowerCase() === 'fabric') {
    const supplier = resolveFabricForSupplierName(item, fabricCatalog);
    if (supplier) return supplier;
    const fallback = String(item.item_name || item.fabric_name || '').trim();
    if (fallback && fallback !== 'N/A') return fallback;
    return '—';
  }
  return String(item.item_name || '').trim() || 'N/A';
}
