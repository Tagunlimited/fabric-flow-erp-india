import { supabase } from '@/integrations/supabase/client';
import { chunkArray } from '@/lib/chunkArray';

export const FABRIC_MASTER_FETCH_CHUNK = 1000;
export const FABRIC_MASTER_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export interface FabricMasterRow {
  id?: string;
  fabric_code: string;
  fabric_description?: string;
  fabric_name: string;
  fabric_for_supplier?: string;
  type?: string;
  color?: string;
  hex?: string;
  gsm?: string;
  uom?: string;
  rate?: number;
  hsn_code?: string;
  gst?: number;
  image?: string;
  inventory?: number;
  supplier1?: string;
  supplier2?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface FabricMasterListFilters {
  search: string;
  filterType: string;
  columnFilters: {
    fabric_details: string;
    fabric_for_supplier: string;
    color: string;
    gsm: string;
    rate: string;
    inventory: string;
    status: string;
  };
}

function ilikePattern(value: string): string {
  const trimmed = value.trim().replace(/[%_]/g, '');
  return `%${trimmed}%`;
}

/** PostgREST `.or()` values must not contain unescaped commas. */
function orIlike(field: string, pattern: string): string {
  return `${field}.ilike.${pattern}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFabricMasterFilters(query: any, filters: FabricMasterListFilters) {
  let q = query;
  const { search, filterType, columnFilters } = filters;

  if (search.trim()) {
    const pattern = ilikePattern(search);
    q = q.or(
      [
        orIlike('fabric_code', pattern),
        orIlike('fabric_name', pattern),
        orIlike('color', pattern),
        orIlike('type', pattern),
        orIlike('fabric_for_supplier', pattern),
        orIlike('fabric_description', pattern),
      ].join(',')
    );
  }

  if (filterType && filterType !== 'all') {
    q = q.eq('type', filterType);
  }

  if (columnFilters.fabric_details.trim()) {
    const pattern = ilikePattern(columnFilters.fabric_details);
    q = q.or([orIlike('fabric_name', pattern), orIlike('fabric_description', pattern)].join(','));
  }
  if (columnFilters.fabric_for_supplier.trim()) {
    q = q.ilike('fabric_for_supplier', ilikePattern(columnFilters.fabric_for_supplier));
  }
  if (columnFilters.color.trim()) {
    const pattern = ilikePattern(columnFilters.color);
    q = q.or([orIlike('color', pattern), orIlike('hex', pattern)].join(','));
  }
  if (columnFilters.gsm.trim()) {
    q = q.ilike('gsm', ilikePattern(columnFilters.gsm));
  }
  if (columnFilters.rate.trim()) {
    const digits = columnFilters.rate.replace(/[^\d.]/g, '');
    if (digits) {
      q = q.ilike('rate', `%${digits}%`);
    }
  }
  if (columnFilters.inventory.trim()) {
    const digits = columnFilters.inventory.replace(/[^\d.]/g, '');
    if (digits) {
      q = q.ilike('inventory', `%${digits}%`);
    }
  }
  if (columnFilters.status.trim()) {
    q = q.ilike('status', ilikePattern(columnFilters.status));
  }

  return q;
}

/** Direct fabric_master links via warehouse + GRN (not fabric_inventory — that FK targets fabrics). */
export async function attachComputedInventoryToFabrics(
  fabrics: FabricMasterRow[],
  options?: { includeWarehouseNameMatch?: boolean }
): Promise<FabricMasterRow[]> {
  if (!fabrics.length) return fabrics;

  const ids = fabrics.map((f) => f.id).filter((id): id is string => Boolean(id));
  const inventoryTotals: Record<string, number> = {};

  for (const idChunk of chunkArray(ids, 100)) {
    const { data: grnFabricDetailsData, error: grnError } = await supabase
      .from('grn_items_fabric_details')
      .select('fabric_id, approved_quantity')
      .in('fabric_id', idChunk);

    if (grnError) {
      console.warn('Could not fetch GRN fabric details:', grnError.message);
    } else {
      (grnFabricDetailsData || []).forEach((item: { fabric_id?: string; approved_quantity?: number }) => {
        if (item.fabric_id && item.approved_quantity) {
          inventoryTotals[item.fabric_id] =
            (inventoryTotals[item.fabric_id] || 0) + item.approved_quantity;
        }
      });
    }

    const { data: warehouseByItemId, error: warehouseError } = await supabase
      .from('warehouse_inventory')
      .select('quantity, item_id')
      .in('item_id', idChunk);

    if (warehouseError) {
      console.warn('Could not fetch warehouse inventory by item_id:', warehouseError.message);
    } else {
      (warehouseByItemId || []).forEach((item: { item_id?: string; quantity?: number }) => {
        if (item.item_id && item.quantity) {
          inventoryTotals[item.item_id] = (inventoryTotals[item.item_id] || 0) + Number(item.quantity);
        }
      });
    }
  }

  if (options?.includeWarehouseNameMatch) {
    const nameToId = new Map<string, string>();
    fabrics.forEach((f) => {
      if (f.id && f.fabric_name) {
        nameToId.set(f.fabric_name.toLowerCase(), f.id);
      }
    });

    const { data: warehouseInventoryData, error: warehouseNameError } = await supabase
      .from('warehouse_inventory')
      .select(`
        quantity,
        grn_item:grn_item_id (
          fabric_name,
          item_name,
          item_type
        )
      `);

    if (warehouseNameError) {
      console.warn('Could not fetch warehouse inventory for name match:', warehouseNameError.message);
    } else {
      (warehouseInventoryData || []).forEach((item: {
        quantity?: number;
        grn_item?: { fabric_name?: string; item_name?: string; item_type?: string } | null;
      }) => {
        const fabricName = item.grn_item?.fabric_name;
        const itemName = item.grn_item?.item_name;
        const itemType = item.grn_item?.item_type;
        if (!item.quantity) return;

        let fabricId: string | undefined;
        if (fabricName) {
          fabricId = nameToId.get(fabricName.toLowerCase());
        }
        if (!fabricId && itemType?.toLowerCase() === 'fabric' && itemName) {
          fabricId = nameToId.get(itemName.toLowerCase());
        }
        if (fabricId) {
          inventoryTotals[fabricId] = (inventoryTotals[fabricId] || 0) + Number(item.quantity);
        }
      });
    }
  }

  return fabrics.map((fabric) => ({
    ...fabric,
    inventory: fabric.id
      ? (inventoryTotals[fabric.id] ?? (Number(fabric.inventory) || 0))
      : (Number(fabric.inventory) || 0),
  }));
}

export async function fetchFabricMasterPage(params: {
  page: number;
  pageSize: number;
  filters: FabricMasterListFilters;
}): Promise<{ rows: FabricMasterRow[]; total: number }> {
  const { page, pageSize, filters } = params;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('fabric_master')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  query = applyFabricMasterFilters(query, filters);

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  const rows = await attachComputedInventoryToFabrics((data as FabricMasterRow[]) || [], {
    includeWarehouseNameMatch: true,
  });

  return { rows, total: count ?? 0 };
}

export async function fetchAllFabricMasterMatchingFilters(
  filters: FabricMasterListFilters,
  onProgress?: (loaded: number) => void
): Promise<FabricMasterRow[]> {
  let all: FabricMasterRow[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from('fabric_master')
      .select('*')
      .order('created_at', { ascending: false });

    query = applyFabricMasterFilters(query, filters);

    const { data, error, count } = await query.range(from, from + FABRIC_MASTER_FETCH_CHUNK - 1);
    if (error) throw error;

    const rows = (data as FabricMasterRow[]) || [];
    all = [...all, ...rows];
    onProgress?.(all.length);

    const total = count ?? null;
    if (total != null) {
      if (all.length >= total) break;
    } else if (rows.length < FABRIC_MASTER_FETCH_CHUNK) {
      break;
    }

    from += FABRIC_MASTER_FETCH_CHUNK;
  }

  const withInventory: FabricMasterRow[] = [];
  for (const batch of chunkArray(all, 500)) {
    const merged = await attachComputedInventoryToFabrics(batch, {
      includeWarehouseNameMatch: false,
    });
    withInventory.push(...merged);
  }

  return withInventory;
}

export async function fetchDistinctFabricTypes(): Promise<string[]> {
  const types = new Set<string>();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('fabric_master')
      .select('type')
      .not('type', 'is', null)
      .order('type')
      .range(from, from + FABRIC_MASTER_FETCH_CHUNK - 1);

    if (error) throw error;
    const rows = data || [];
    rows.forEach((row: { type?: string | null }) => {
      if (row.type?.trim()) types.add(row.type.trim());
    });

    if (rows.length < FABRIC_MASTER_FETCH_CHUNK) break;
    from += FABRIC_MASTER_FETCH_CHUNK;
  }

  return [...types].sort((a, b) => a.localeCompare(b));
}
