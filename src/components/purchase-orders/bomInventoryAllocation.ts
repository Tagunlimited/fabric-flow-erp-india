import type { SupabaseClient } from '@supabase/supabase-js';

/** Values to try when matching `fabric_master.gsm` to BOM `fabric_gsm`. */
export function normalizeGsmVariants(gsm: string | null | undefined): string[] {
  const t = `${gsm ?? ''}`.trim();
  if (!t) return [];
  const out = new Set<string>();
  out.add(t);
  const num = t.match(/\d+(?:\.\d+)?/)?.[0];
  if (num) {
    out.add(num);
    out.add(`${num} GSM`);
    out.add(`${num}GSM`);
    out.add(`${num} Gsm`);
    out.add(`${num} gsm`);
  }
  if (!/gsm/i.test(t) && num) {
    out.add(`${num} GSM`);
  }
  return [...out];
}

function fabricMasterVariantMatchesRow(
  m: { fabric_name?: string | null; color?: string | null; gsm?: string | null },
  fabricName: string,
  colorTrim: string,
  gsmTrim: string
): boolean {
  const nf = (s: string) => `${s ?? ''}`.trim().toLowerCase();
  if (nf(m.fabric_name || '') !== nf(fabricName)) return false;
  if (colorTrim && nf(m.color || '') !== nf(colorTrim)) return false;
  const gsmVars = normalizeGsmVariants(gsmTrim);
  if (gsmTrim && gsmVars.length > 0) {
    const mg = nf(m.gsm || '');
    return gsmVars.some((v) => {
      const nv = nf(v);
      return nv === mg || mg.includes(nv) || nv.includes(mg);
    });
  }
  return true;
}

/** When warehouse rows share a fabric name but differ by variant, keep rows whose `item_id` matches color/GSM. */
async function narrowFabricInventoryRowsByVariant(
  supabaseClient: SupabaseClient,
  rows: any[],
  fabricName: string,
  colorTrim: string,
  gsmTrim: string
): Promise<any[]> {
  const ids = [...new Set(rows.map((r) => r.item_id).filter(Boolean))];
  if (!ids.length) return rows;

  const { data: masters, error } = await supabaseClient
    .from('fabric_master')
    .select('id, fabric_name, color, gsm')
    .in('id', ids);

  if (error || !masters?.length) return rows;

  const allowed = new Set(
    (masters as any[])
      .filter((m) => fabricMasterVariantMatchesRow(m, fabricName, colorTrim, gsmTrim))
      .map((m) => m.id)
  );

  if (allowed.size === 0) return [];

  const narrowed = rows.filter((r) => r.item_id && allowed.has(r.item_id));
  return narrowed;
}

/** Resolve `fabric_master.id` for a BOM fabric line (warehouse `item_id` for FABRIC rows). */
export async function resolveFabricMasterIdForBomItem(
  item: any,
  fabricName: string | undefined,
  supabaseClient: SupabaseClient
): Promise<string | null> {
  const fabricIdCol = (item as any)?.fabric_id;
  if (fabricIdCol) return String(fabricIdCol);

  const code = `${(item as any)?.item_code ?? ''}`.trim();
  if (code) {
    const { data: byCode, error } = await supabaseClient
      .from('fabric_master')
      .select('id')
      .eq('fabric_code', code)
      .limit(2);
    if (!error && byCode?.length === 1) return (byCode[0] as any).id;
  }

  if (item?.item_id) {
    const { data: fm } = await supabaseClient
      .from('fabric_master')
      .select('id')
      .eq('id', item.item_id)
      .maybeSingle();
    if (fm) return String(item.item_id);
  }

  const name = fabricName?.trim();
  if (!name) return null;

  const color = `${item?.fabric_color ?? ''}`.trim();
  const gsmRaw = `${item?.fabric_gsm ?? ''}`.trim();
  const gsmVariants = normalizeGsmVariants(gsmRaw);

  const runQuery = async (useGsm: boolean) => {
    let q = supabaseClient.from('fabric_master').select('id, gsm').eq('fabric_name', name);
    if (color) q = q.ilike('color', color);
    if (useGsm && gsmVariants.length > 0) q = q.in('gsm', gsmVariants);
    const { data, error } = await q.limit(8);
    if (error) return null;
    return data as { id: string; gsm?: string | null }[] | null;
  };

  let rows = await runQuery(true);
  if (!rows?.length && gsmVariants.length > 0 && color) {
    rows = await runQuery(false);
  }
  if (!rows?.length && !color && !gsmRaw) {
    const { data, error } = await supabaseClient
      .from('fabric_master')
      .select('id')
      .eq('fabric_name', name)
      .limit(2);
    if (!error && data?.length === 1) return (data[0] as any).id;
  }

  if (!rows?.length) return null;
  if (rows.length === 1) return rows[0].id;

  if (gsmRaw) {
    const exact = rows.find((r) => `${r.gsm ?? ''}`.trim() === gsmRaw);
    if (exact) return exact.id;
    const norm = gsmRaw.toLowerCase();
    const loose = rows.find((r) => `${r.gsm ?? ''}`.trim().toLowerCase() === norm);
    if (loose) return loose.id;
  }
  return rows[0].id;
}

export type InventorySourceRow = {
  id: string;
  quantity: number;
  allocated: number;
  available: number;
  unit?: string | null;
  /** Bin / rack / warehouse summary when loaded from `warehouse_inventory` joins */
  locationLabel?: string | null;
};

function locationLabelFromWarehouseRow(row: any): string | undefined {
  const b = row?.bin;
  if (!b) return undefined;
  const wh = b?.rack?.floor?.warehouse;
  const parts = [wh?.name || wh?.code, b?.rack?.rack_code, b?.bin_code].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

export type BomRecordItemStockResult = {
  unit: string;
  totalQuantity: number;
  totalAvailable: number;
  inventorySources: InventorySourceRow[];
  totalAllocatedToThisItem: number;
  totalAllocatedFromInventory: number;
};

/**
 * Warehouse availability + per–BOM-item allocation totals for one `bom_record_items` row.
 */
export async function fetchStockForBomRecordItem(
  supabaseClient: SupabaseClient,
  item: any
): Promise<BomRecordItemStockResult> {
  const category = (item?.category || '').toLowerCase();
  const itemTypeFilter = category === 'fabric' ? 'FABRIC' : 'ITEM';
  let resolvedUnit = item?.unit_of_measure || item?.required_unit || '';
  const fabricName = item?.fabric_name?.trim() || item?.item_name?.split(' - ')[0]?.trim();
  const normalizedItemName = item?.item_name?.trim();
  const fabricColorTrim = `${item?.fabric_color ?? ''}`.trim();
  const fabricGsmTrim = `${item?.fabric_gsm ?? ''}`.trim();
  const hasFabricVariantHint = !!(fabricColorTrim || fabricGsmTrim);

  const targetFabricId =
    category === 'fabric'
      ? await resolveFabricMasterIdForBomItem(item, fabricName, supabaseClient)
      : null;

  const normalize = (value: string | number | null | undefined) =>
    `${value ?? ''}`.trim().toLowerCase();

  const matchesInventoryRow = (row: any) => {
    if (!row) return false;
    if (category === 'fabric' && targetFabricId) {
      return row.item_id === targetFabricId;
    }
    if (item?.item_id && row.item_id && row.item_id === item.item_id) {
      return true;
    }

    const targetCode = normalize((item as any)?.item_code);
    const rowCode = normalize(row.item_code);
    if (targetCode && rowCode && targetCode === rowCode) {
      return true;
    }

    const rowName = normalize(row.item_name);
    if (category === 'fabric') {
      const targetFabricName = normalize(fabricName);
      if (targetFabricName && rowName === targetFabricName) {
        if (!hasFabricVariantHint) return true;
        return Boolean(row.item_id);
      }
    } else {
      const targetItemName = normalize(normalizedItemName);
      if (targetItemName && rowName === targetItemName) {
        return true;
      }
    }

    return false;
  };

  const fetchWarehouseInventory = async (
    configureQuery?: (query: any) => any
  ): Promise<any[] | null> => {
    try {
      let query = supabaseClient
        .from('warehouse_inventory' as any)
        .select(
          `
          id,
          quantity,
          unit,
          item_name,
          item_code,
          item_id,
          bin:bin_id (
            bin_code,
            rack:rack_id (
              rack_code,
              floor:floor_id (
                floor_number,
                warehouse:warehouse_id ( name, code )
              )
            )
          )
        `
        )
        .in('status', ['IN_STORAGE', 'RECEIVED'])
        .eq('item_type', itemTypeFilter);

      if (configureQuery) {
        query = configureQuery(query);
      }

      const { data, error } = await query;

      if (error) {
        console.warn('Failed to fetch warehouse inventory for BOM item', {
          itemId: item?.id,
          category,
          error,
        });
        return null;
      }

      if (data && data.length > 0) {
        let working = data as any[];
        if (
          category === 'fabric' &&
          fabricName &&
          hasFabricVariantHint &&
          !targetFabricId &&
          working.some((r) => r.item_id)
        ) {
          working = await narrowFabricInventoryRowsByVariant(
            supabaseClient,
            working,
            fabricName,
            fabricColorTrim,
            fabricGsmTrim
          );
        }
        const filtered = working.filter(matchesInventoryRow);
        if (filtered.length > 0) {
          return filtered;
        }
      }
    } catch (err) {
      console.error('Unexpected error while fetching warehouse inventory for BOM item', {
        itemId: item?.id,
        err,
      });
    }

    return null;
  };

  const warehouseInventoryStrategies: ((query: any) => any)[] = [];

  if (category === 'fabric' && targetFabricId) {
    warehouseInventoryStrategies.push((query) => query.eq('item_id', targetFabricId));
  } else if (item?.item_id) {
    warehouseInventoryStrategies.push((query) => query.eq('item_id', item.item_id));
  }

  if (item?.item_code) {
    warehouseInventoryStrategies.push((query) => query.eq('item_code', item.item_code));
  }

  if (category === 'fabric') {
    if (fabricName && !targetFabricId) {
      warehouseInventoryStrategies.push((query) => query.eq('item_name', fabricName));
      warehouseInventoryStrategies.push((query) => query.ilike('item_name', `%${fabricName}%`));
    }
  } else if (normalizedItemName) {
    warehouseInventoryStrategies.push((query) => query.eq('item_name', normalizedItemName));
    warehouseInventoryStrategies.push((query) => query.ilike('item_name', `%${normalizedItemName}%`));
  }

  let inventoryRows: any[] | null = null;

  for (const strategy of warehouseInventoryStrategies) {
    inventoryRows = await fetchWarehouseInventory(strategy);
    if (inventoryRows && inventoryRows.length > 0) {
      break;
    }
  }

  if (!inventoryRows) {
    const skipBroadFabricFetch = category === 'fabric' && targetFabricId != null;
    if (!skipBroadFabricFetch) {
      inventoryRows = await fetchWarehouseInventory();
    }
  }

  let totalQuantity = 0;
  let summaryFallbackAvailable = 0;
  let inventoryAllocationsMap: Record<string, number> = {};

  if (inventoryRows && inventoryRows.length > 0) {
    totalQuantity = inventoryRows.reduce((sum, row) => sum + Number(row?.quantity || 0), 0);

    const unitFromRow = inventoryRows.find((row) => row?.unit)?.unit;
    if (unitFromRow) {
      resolvedUnit = unitFromRow;
    }

    try {
      const inventoryIds = inventoryRows.map((row) => row.id);
      if (inventoryIds.length > 0) {
        const { data: allocationRows, error: allocationError } = await supabaseClient
          .from('inventory_allocations' as any)
          .select('warehouse_inventory_id, quantity')
          .in('warehouse_inventory_id', inventoryIds);

        if (allocationError) {
          console.warn('Failed to fetch allocation summary for inventory rows', allocationError);
        } else if (allocationRows) {
          inventoryAllocationsMap = allocationRows.reduce((acc: Record<string, number>, row: any) => {
            const key = row.warehouse_inventory_id;
            const qty = Number(row.quantity || 0);
            acc[key] = (acc[key] || 0) + qty;
            return acc;
          }, {} as Record<string, number>);
        }
      }
    } catch (err) {
      console.error('Unexpected error while fetching inventory allocations summary', err);
    }
  } else if (category === 'fabric') {
    try {
      if (fabricName) {
        let fabricQuery = supabaseClient
          .from('fabric_stock_summary' as any)
          .select('total_available, total_quantity, unit, color, gsm')
          .eq('fabric_name', fabricName);

        const fabricColor = fabricColorTrim || undefined;
        const fabricGsm = fabricGsmTrim || undefined;

        if (fabricColor) {
          fabricQuery = fabricQuery.eq('color', fabricColor);
        }

        if (fabricGsm) {
          const gsmVars = normalizeGsmVariants(fabricGsm);
          fabricQuery =
            gsmVars.length > 1
              ? fabricQuery.in('gsm', gsmVars)
              : fabricQuery.eq('gsm', fabricGsm);
        }

        const { data: fabricStockRows, error: fabricStockError } = await fabricQuery.limit(1);

        if (fabricStockError) {
          console.warn('Failed to fetch fabric stock summary for BOM item', {
            itemId: item?.id,
            fabricName,
            fabricColor,
            fabricGsm,
            error: fabricStockError,
          });
        } else if (fabricStockRows && fabricStockRows.length > 0) {
          const fabricStock = fabricStockRows[0] as any;
          const available = Number(
            fabricStock?.total_available ?? fabricStock?.total_quantity ?? 0
          );
          if (!Number.isNaN(available)) {
            totalQuantity = available;
            summaryFallbackAvailable = available;
          }
          if (fabricStock?.unit) {
            resolvedUnit = fabricStock.unit;
          }
        }
      }
    } catch (error) {
      console.error('Unexpected error while resolving fabric stock summary for BOM item', {
        itemId: item?.id,
        error,
      });
    }
  }

  let totalAllocatedToThisItem = 0;
  try {
    if (item?.id) {
      const { data: bomAllocations, error: bomAllocationError } = await supabaseClient
        .from('inventory_allocations' as any)
        .select('quantity')
        .eq('bom_item_id', item.id);

      if (bomAllocationError) {
        console.warn('Failed to fetch allocations for BOM item', bomAllocationError);
      } else if (bomAllocations) {
        totalAllocatedToThisItem = bomAllocations.reduce((sum: number, row: any) => {
          return sum + Number(row.quantity || 0);
        }, 0);
      }
    }
  } catch (err) {
    console.error('Unexpected error while fetching BOM item allocations', err);
  }

  const inventorySources = (inventoryRows || []).map((row) => {
    const allocated = Number(inventoryAllocationsMap[row.id] || 0);
    const quantity = Number(row.quantity || 0);
    return {
      id: row.id,
      quantity,
      allocated,
      available: Math.max(quantity - allocated, 0),
      unit: row.unit,
      locationLabel: locationLabelFromWarehouseRow(row) ?? null,
    };
  });

  const totalAllocatedFromInventory = inventorySources.reduce(
    (sum, source) => sum + source.allocated,
    0
  );

  const fromSources = inventorySources.reduce((sum, source) => sum + source.available, 0);
  const totalAvailable =
    inventorySources.length > 0 ? fromSources : Math.max(fromSources, summaryFallbackAvailable);

  return {
    unit: resolvedUnit,
    totalQuantity,
    totalAvailable,
    inventorySources,
    totalAllocatedToThisItem,
    totalAllocatedFromInventory,
  };
}

export type BomDisplayAllocationTarget = {
  id: string | null;
  /** BOM that owns this line (required when the PO form is not scoped to a single BOM). */
  bom_id?: string | null;
  isBulk?: boolean;
  item_name?: string;
  items?: any[];
  stock_unit?: string;
  required_unit?: string;
  required_qty?: number;
  allocation?: {
    totalAllocated?: number;
    totalAvailable?: number;
    inventorySources?: InventorySourceRow[];
  };
};

export async function insertBomInventoryAllocations(
  supabaseClient: SupabaseClient,
  bomId: string,
  payload:
    | {
        mode: 'single';
        warehouseInventoryId: string;
        bomItemId: string;
        quantity: number;
        unit: string;
      }
    | { mode: 'bulk'; rows: Array<{ warehouse_inventory_id: string; bom_item_id: string; quantity: number; unit: string }> }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (payload.mode === 'single') {
      const { error } = await supabaseClient.from('inventory_allocations' as any).insert({
        warehouse_inventory_id: payload.warehouseInventoryId,
        bom_id: bomId,
        bom_item_id: payload.bomItemId,
        quantity: payload.quantity,
        unit: payload.unit,
      });
      if (error) {
        console.error('Failed to allocate stock', error);
        return { ok: false, error: 'Failed to allocate stock. Please try again.' };
      }
      return { ok: true };
    }
    if (!payload.rows.length) {
      return { ok: false, error: 'No allocations to insert.' };
    }
    const { error } = await supabaseClient.from('inventory_allocations' as any).insert(payload.rows);
    if (error) {
      console.error('Failed to allocate stock', error);
      return { ok: false, error: 'Failed to allocate stock. Please try again.' };
    }
    return { ok: true };
  } catch (e) {
    console.error('insertBomInventoryAllocations', e);
    return { ok: false, error: 'An unexpected error occurred while allocating stock.' };
  }
}

/** Build bulk allocation rows (same rules as legacy BomList handleAllocateStock). */
export function buildBulkAllocationRows(
  bomId: string,
  warehouseInventoryId: string,
  selectedSource: InventorySourceRow & { available: number },
  processedItems: Array<{
    id: string | null;
    required_qty: number;
    stock_unit?: string;
    required_unit?: string;
    allocation?: { totalAllocated?: number; totalAvailable?: number };
  }>
): { rows: Array<{ warehouse_inventory_id: string; bom_id: string; bom_item_id: string; quantity: number; unit: string }>; error?: string } {
  const source = { ...selectedSource, available: selectedSource.available };
  const remainingItems = processedItems.filter((item) => {
    const remaining = Math.max(item.required_qty - (item.allocation?.totalAllocated || 0), 0);
    return remaining > 0 && (item.allocation?.totalAvailable || 0) > 0 && item.id;
  });

  if (!remainingItems.length) {
    return { rows: [], error: 'All items are already fully allocated.' };
  }

  const rows: Array<{
    warehouse_inventory_id: string;
    bom_id: string;
    bom_item_id: string;
    quantity: number;
    unit: string;
  }> = [];

  for (const item of remainingItems) {
    if (!item.id) continue;
    const remaining = Math.max(item.required_qty - (item.allocation?.totalAllocated || 0), 0);
    const allocatable = Math.min(
      remaining,
      item.allocation?.totalAvailable || 0,
      source.available
    );
    source.available -= allocatable;
    if (allocatable > 0) {
      const rowBomId = (item as { bom_id?: string }).bom_id || bomId;
      rows.push({
        warehouse_inventory_id: warehouseInventoryId,
        bom_id: rowBomId,
        bom_item_id: item.id,
        quantity: allocatable,
        unit: item.stock_unit || selectedSource.unit || item.required_unit || '',
      });
    }
  }

  if (!rows.length) {
    return { rows: [], error: 'No allocatable quantity found for the selected source.' };
  }
  return { rows };
}
