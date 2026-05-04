import { supabase } from '@/integrations/supabase/client';
import { normalizeUnit, resolveWarehouseFabricId, sameUnitFamily } from '@/utils/fabricInventoryIdentity';

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
      quantity,
      unit,
      status,
      bin:bin_id (id, location_type),
      grn_item:grn_item_id (po_item_id, fabric_color, fabric_gsm)
    `)
    .eq('item_type', 'FABRIC')
    .eq('status', 'IN_STORAGE');

  if (whError) throw whError;

  const storageRows = (warehouseRows || []).filter(
    (r: any) => String(r?.bin?.location_type || '') === 'STORAGE'
  );

  const poItemIds = Array.from(
    new Set(
      storageRows
        .map((r: any) => String(r?.grn_item?.po_item_id || '').trim())
        .filter(Boolean)
    )
  );

  const poFabricByPoItemId = new Map<string, string>();
  if (poItemIds.length > 0) {
    const { data: poItemsData, error: poErr } = await supabase
      .from('purchase_order_items')
      .select('id, fabric_id')
      .in('id', poItemIds as any);
    if (poErr) throw poErr;
    (poItemsData || []).forEach((row: any) => {
      const poId = String(row?.id || '').trim();
      const fid = String(row?.fabric_id || '').trim();
      if (poId && fid) poFabricByPoItemId.set(poId, fid);
    });
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
            order_id
          )
        )
      `)
      .in('warehouse_inventory_id', invIds as any);
    if (allocErr) throw allocErr;
    (allocRows || []).forEach((row: any) => {
      const key = String(row?.warehouse_inventory_id || '').trim();
      if (!key) return;
      const allocOrderId = String(row?.bom_item?.bom?.order_id || '').trim();
      const currentOrderId = String(params.currentOrderId || '').trim();
      const isOtherOrderAllocation = !!allocOrderId && allocOrderId !== currentOrderId;
      if (!isOtherOrderAllocation) return;
      allocationsByInvId[key] = (allocationsByInvId[key] || 0) + Number(row?.quantity || 0);
    });
  }

  const { data: fabricRows, error: fabricErr } = await supabase
    .from('fabric_master')
    .select('id, color, gsm, uom')
    .in('id', fabricIds as any);
  if (fabricErr) throw fabricErr;
  const fabricById = new Map<string, FabricMasterLite>();
  (fabricRows || []).forEach((f: any) => fabricById.set(String(f.id), f));

  const out: Record<string, FabricAvailabilityResult> = {};
  fabricIds.forEach((fabricId) => {
    const fabric = fabricById.get(fabricId) || { id: fabricId };
    let gross = 0;
    let allocated = 0;
    let unit = '';
    const rowIds: string[] = [];

    storageRows.forEach((row: any) => {
      const resolvedFabricId = resolveWarehouseFabricId(
        { item_id: row.item_id, grn_item_po_item_id: row?.grn_item?.po_item_id },
        poFabricByPoItemId
      );
      if (resolvedFabricId !== fabricId) return;
      if (!variantLikelyMatches(row?.grn_item?.fabric_color, row?.grn_item?.fabric_gsm, fabric.color, fabric.gsm)) {
        return;
      }
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
