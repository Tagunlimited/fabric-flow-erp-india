import { supabase } from '@/integrations/supabase/client';
import { normalizeUnit, resolveWarehouseFabricId, sameUnitFamily } from '@/utils/fabricInventoryIdentity';

/** Normalized variant key aligned with inventory grouping (name + color + gsm). */
function fabricVariantKey(parts: { name: string; color: string; gsm: string }): string {
  return [
    String(parts.name || '').trim().toLowerCase(),
    String(parts.color || '').trim().toLowerCase(),
    String(parts.gsm ?? '').trim().toLowerCase(),
  ].join('|');
}

function fabricMasterVariantParts(fabric: FabricMasterLite): { name: string; color: string; gsm: string } {
  return {
    name: String(fabric.fabric_name || '').trim(),
    color: String(fabric.color || '').trim(),
    gsm: String(fabric.gsm ?? '').trim(),
  };
}

type PoLineFabricHint = {
  fabric_id: string | null;
  fabric_name: string | null;
  fabric_color: string | null;
  fabric_gsm: string | null;
};

/** GRN + PO + warehouse row text used when item_id / PO fabric_id are missing (mirrors inventory fallback). */
function warehouseRowVariantParts(row: any, poLineByPoItemId: Map<string, PoLineFabricHint>): { name: string; color: string; gsm: string } | null {
  const gi = row?.grn_item;
  const poItemId = String(gi?.po_item_id || '').trim();
  const po = poItemId ? poLineByPoItemId.get(poItemId) : undefined;
  const name = String(gi?.fabric_name || po?.fabric_name || row?.item_name || '').trim();
  const color = String(gi?.item_color || gi?.fabric_color || po?.fabric_color || '').trim();
  const gsm = String(gi?.fabric_gsm ?? po?.fabric_gsm ?? '').trim();
  if (!name && !color && !gsm) return null;
  return { name, color, gsm };
}

/** True if warehouse row matches fabric_master variant exactly (normalized). */
function warehouseRowMatchesFabricVariant(row: any, fabric: FabricMasterLite, poLineByPoItemId: Map<string, PoLineFabricHint>): boolean {
  const rp = warehouseRowVariantParts(row, poLineByPoItemId);
  if (!rp) return false;
  return fabricVariantKey(rp) === fabricVariantKey(fabricMasterVariantParts(fabric));
}

/**
 * Whether this inventory row contributes to availability for `fabricId`.
 * Prefer item_id / PO fabric_id; fall back to name+color+gsm when GRN rows lack item_id.
 */
function warehouseRowMatchesFabricForCutting(
  row: any,
  fabricId: string,
  poFabricByPoItemId: Map<string, string>,
  fabric?: FabricMasterLite | null,
  poLineByPoItemId?: Map<string, PoLineFabricHint>
): boolean {
  const direct =
    resolveWarehouseFabricId({ item_id: row.item_id, grn_item_po_item_id: row?.grn_item?.po_item_id }, poFabricByPoItemId) || '';
  if (direct === fabricId) return true;
  if (fabric && poLineByPoItemId && warehouseRowMatchesFabricVariant(row, fabric, poLineByPoItemId)) {
    return true;
  }
  return false;
}

type FabricMasterLite = {
  id: string;
  fabric_name?: string | null;
  color?: string | null;
  gsm?: number | string | null;
  image?: string | null;
  uom?: string | null;
  hex?: string | null;
};

export type FabricAvailabilityResult = {
  fabric_id: string;
  available_quantity: number;
  unit: string;
  contributing_row_ids: string[];
  gross_quantity: number;
  allocated_quantity: number;
};

/** Returns true if this allocation row should reduce cutting-time “available” fabric (active BOM/order on another order). */
function allocationShouldReserveStock(allocRow: any, currentOrderId: string): boolean {
  const current = String(currentOrderId || '').trim();
  const bom = allocRow?.bom_item?.bom;
  if (!bom) return false;
  const allocOrderId = String(bom.order_id ?? bom.order?.id ?? '').trim();
  if (!allocOrderId || allocOrderId === current) return false;
  if (bom.is_deleted === true) return false;
  const bomStatus = String(bom.status || '').trim().toLowerCase();
  if (['cancelled', 'void', 'archived'].includes(bomStatus)) return false;
  const ord = bom.order;
  if (ord) {
    if (ord.is_deleted === true) return false;
    const orderStatus = String(ord.status || '').trim().toLowerCase();
    if (['cancelled', 'completed', 'dispatched'].includes(orderStatus)) return false;
  }
  return true;
}

/** Same inclusion rule as [StorageZoneInventory] raw-material bin filter. */
export function isFabricWarehouseRowInInventoryScope(status: string | null | undefined, binLocationType: string | null | undefined): boolean {
  const st = String(status || '');
  const lt = String(binLocationType || '');
  return (st === 'IN_STORAGE' && lt === 'STORAGE') || (st === 'READY_TO_DISPATCH' && lt === 'DISPATCH_ZONE');
}

export function variantLikelyMatches(
  rowColor: string | null | undefined,
  rowGsm: string | number | null | undefined,
  fabricColor: string | null | undefined,
  fabricGsm: string | number | null | undefined
): boolean {
  const colorA = String(rowColor || '').trim().toLowerCase();
  const colorB = String(fabricColor || '').trim().toLowerCase();
  const gsmA = String(rowGsm ?? '').trim().toLowerCase();
  const gsmB = String(fabricGsm ?? '').trim().toLowerCase();
  const colorOk = !colorA || !colorB || colorA === colorB;
  const gsmOk = !gsmA || !gsmB || gsmA === gsmB;
  return colorOk && gsmOk;
}

/** Set warehouse_inventory.item_id on rows the UI counts so consume_fabric_for_cutting can deduct. */
async function patchWarehouseRowsForFabricCutting(
  storageRows: any[],
  fabricIds: string[],
  poFabricByPoItemId: Map<string, string>,
  poLineByPoItemId: Map<string, PoLineFabricHint>,
  fabricById: Map<string, FabricMasterLite>
): Promise<void> {
  const patchByRowId = new Map<string, string>();
  fabricIds.forEach((fabricId) => {
    const fabric = fabricById.get(fabricId);
    if (!fabric) return;
    storageRows.forEach((row: any) => {
      if (!warehouseRowMatchesFabricForCutting(row, fabricId, poFabricByPoItemId, fabric, poLineByPoItemId)) return;
      if (String(row.item_id || '') === fabricId) return;
      patchByRowId.set(String(row.id), fabricId);
    });
  });
  if (patchByRowId.size === 0) return;

  const results = await Promise.all(
    [...patchByRowId.entries()].map(([rowId, fabricId]) =>
      supabase.from('warehouse_inventory').update({ item_id: fabricId } as any).eq('id', rowId as any)
    )
  );
  results.forEach((res, idx) => {
    if (res.error) {
      const [rowId, fabricId] = [...patchByRowId.entries()][idx];
      console.warn('[patchWarehouseRowsForFabricCutting] failed', rowId, fabricId, res.error);
    }
  });
  patchByRowId.forEach((fabricId, rowId) => {
    const row = storageRows.find((r: any) => String(r.id) === rowId);
    if (row) row.item_id = fabricId;
  });
}

/** Link GRN warehouse rows to fabric_master before cutting save (client + server must agree). */
export async function syncWarehouseFabricItemIdsForCutting(
  fabricIds: string[],
  currentOrderId?: string | null
): Promise<void> {
  await getFabricAvailabilityByFabricIds({ fabricIds, currentOrderId });
}

export async function getFabricAvailabilityByFabricIds(params: {
  fabricIds: string[];
  currentOrderId?: string | null;
}): Promise<Record<string, FabricAvailabilityResult>> {
  const fabricIds = Array.from(new Set((params.fabricIds || []).filter(Boolean)));
  if (!fabricIds.length) return {};

  const { data: warehouseRows, error: whError } = await supabase
    .from('warehouse_inventory')
    .select(`
      id,
      item_id,
      item_type,
      item_name,
      quantity,
      unit,
      status,
      bin:bin_id (id, bin_code, location_type),
      grn_item:grn_item_id (po_item_id, fabric_name, fabric_color, fabric_gsm, item_color)
    `)
    .eq('item_type', 'FABRIC')
    .in('status', ['IN_STORAGE', 'READY_TO_DISPATCH'] as any);

  if (whError) throw whError;

  const storageRows = (warehouseRows || []).filter((r: any) =>
    isFabricWarehouseRowInInventoryScope(r?.status, r?.bin?.location_type)
  );

  const poItemIds = Array.from(
    new Set(
      storageRows
        .map((r: any) => String(r?.grn_item?.po_item_id || '').trim())
        .filter(Boolean)
    )
  );

  const poFabricByPoItemId = new Map<string, string>();
  const poLineByPoItemId = new Map<string, PoLineFabricHint>();
  if (poItemIds.length > 0) {
    const { data: poItemsData, error: poErr } = await supabase
      .from('purchase_order_items')
      .select('id, fabric_id, fabric_name, fabric_color, fabric_gsm')
      .in('id', poItemIds as any);
    if (poErr) throw poErr;
    (poItemsData || []).forEach((row: any) => {
      const poId = String(row?.id || '').trim();
      if (!poId) return;
      const fid = String(row?.fabric_id || '').trim();
      if (fid) poFabricByPoItemId.set(poId, fid);
      poLineByPoItemId.set(poId, {
        fabric_id: row?.fabric_id ?? null,
        fabric_name: row?.fabric_name ?? null,
        fabric_color: row?.fabric_color ?? null,
        fabric_gsm: row?.fabric_gsm ?? null,
      });
    });
  }

  const { data: fabricRowsEarly, error: fabricEarlyErr } = await supabase
    .from('fabric_master')
    .select('id, fabric_name, color, gsm, uom')
    .in('id', fabricIds as any);
  if (fabricEarlyErr) throw fabricEarlyErr;
  const fabricByIdForDiag = new Map<string, FabricMasterLite>();
  (fabricRowsEarly || []).forEach((f: any) => fabricByIdForDiag.set(String(f.id), f));

  if (import.meta.env.DEV) {
    const diag = (warehouseRows || []).map((row: any) => {
      const st = String(row?.status || '');
      const lt = String(row?.bin?.location_type || '');
      const scopeOk = isFabricWarehouseRowInInventoryScope(st, lt);
      const resolvedDirect =
        resolveWarehouseFabricId(
          { item_id: row.item_id, grn_item_po_item_id: row?.grn_item?.po_item_id },
          poFabricByPoItemId
        ) || '';

      let resolvedFabricId = '';
      let resolution_path = '';
      if (resolvedDirect && fabricIds.includes(resolvedDirect)) {
        resolvedFabricId = resolvedDirect;
        resolution_path = 'direct_or_po';
      } else {
        for (const fid of fabricIds) {
          const fab = fabricByIdForDiag.get(fid);
          if (fab && warehouseRowMatchesFabricVariant(row, fab, poLineByPoItemId)) {
            resolvedFabricId = fid;
            resolution_path = 'name_color_gsm_match';
            break;
          }
        }
        if (!resolvedFabricId && resolvedDirect) {
          resolvedFabricId = resolvedDirect;
          resolution_path = 'direct_not_in_target_list';
        }
      }

      let excluded_reason: string;
      if (!['IN_STORAGE', 'READY_TO_DISPATCH'].includes(st)) {
        excluded_reason = 'wrong_status';
      } else if (!scopeOk) {
        excluded_reason = 'wrong_bin';
      } else if (!resolvedFabricId) {
        excluded_reason = 'null_resolution';
      } else if (!fabricIds.includes(resolvedFabricId)) {
        excluded_reason = 'fabric_id_mismatch';
      } else {
        const fab = fabricByIdForDiag.get(resolvedFabricId);
        const baseUom = String(fab?.uom || 'kg');
        const rowUnit = String(row.unit || fab?.uom || 'kg');
        if (!sameUnitFamily(baseUom, rowUnit)) excluded_reason = 'unit_mismatch';
        else if (resolution_path === 'name_color_gsm_match') excluded_reason = 'name_color_gsm_match';
        else excluded_reason = 'included';
      }

      const included = excluded_reason === 'included' || excluded_reason === 'name_color_gsm_match';
      return {
        id: row.id,
        item_id: row.item_id,
        item_type: row.item_type,
        status: row.status,
        bin_code: row.bin?.bin_code,
        location_type: row.bin?.location_type,
        quantity: row.quantity,
        unit: row.unit,
        grn_po_item_id: row.grn_item?.po_item_id ?? '',
        resolved_fabric_id: resolvedFabricId,
        resolution_path,
        included,
        excluded_reason,
      };
    });
    console.table(diag);
    console.log('[getFabricAvailabilityByFabricIds] target fabricIds', fabricIds);
  }

  const invIds = storageRows.map((r: any) => r.id).filter(Boolean);
  const allocationsByInvId: Record<string, number> = {};
  if (invIds.length > 0) {
    const { data: allocRows, error: allocErr } = await supabase
      .from('inventory_allocations' as any)
      .select(`
        warehouse_inventory_id,
        quantity,
        bom_item:bom_item_id (
          bom:bom_id (
            order_id,
            is_deleted,
            status,
            order:order_id (
              id,
              status,
              is_deleted
            )
          )
        )
      `)
      .in('warehouse_inventory_id', invIds as any);
    if (allocErr) throw allocErr;
    const currentOrderId = String(params.currentOrderId || '').trim();
    (allocRows || []).forEach((row: any) => {
      const key = String(row?.warehouse_inventory_id || '').trim();
      if (!key) return;
      if (!allocationShouldReserveStock(row, currentOrderId)) return;
      allocationsByInvId[key] = (allocationsByInvId[key] || 0) + Number(row?.quantity || 0);
    });
  }

  const fabricById = fabricByIdForDiag;

  await patchWarehouseRowsForFabricCutting(storageRows, fabricIds, poFabricByPoItemId, poLineByPoItemId, fabricById);

  const out: Record<string, FabricAvailabilityResult> = {};
  fabricIds.forEach((fabricId) => {
    const fabric = fabricById.get(fabricId) || { id: fabricId };
    let gross = 0;
    let allocated = 0;
    let unit = '';
    const rowIds: string[] = [];

    storageRows.forEach((row: any) => {
      if (!warehouseRowMatchesFabricForCutting(row, fabricId, poFabricByPoItemId, fabric, poLineByPoItemId)) return;
      const rowUnit = String(row.unit || fabric.uom || 'kg');
      if (!unit) unit = rowUnit;
      if (!sameUnitFamily(unit, rowUnit)) return;
      const rowGross = Number(row.quantity || 0);
      const rowAllocated = Number(allocationsByInvId[String(row.id)] || 0);
      gross += rowGross;
      allocated += rowAllocated;
      rowIds.push(String(row.id));
    });

    const net = Math.max(0, gross - allocated);
    const normalizedUnit = normalizeUnit(unit || fabric.uom || 'kg');
    out[fabricId] = {
      fabric_id: fabricId,
      available_quantity: net,
      unit: normalizedUnit === 'kg' ? 'Kgs' : normalizedUnit,
      contributing_row_ids: rowIds,
      gross_quantity: gross,
      allocated_quantity: allocated,
    };
  });

  return out;
}
