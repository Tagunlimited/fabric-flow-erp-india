import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Archive, Package, Search, Eye, History, Trash2, Download, Truck, Filter, Columns3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { WarehouseInventory, BinInventorySummary, INVENTORY_STATUS_CONFIGS } from '@/types/warehouse-inventory';
import { toast } from 'sonner';
import { InventoryLogsModal } from './InventoryLogsModal';
import { DeleteWarehouseInventoryDialog } from './DeleteWarehouseInventoryDialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  hasMeaningfulColorLabel,
  resolveSwatchHex,
  resolveWarehouseFabricSwatch,
} from '@/lib/grnColorSwatch';
import { buildWarehouseIdentityKey } from '@/utils/fabricVariantIdentity';
import { resolveWarehouseFabricId } from '@/utils/fabricInventoryIdentity';

interface StorageZoneInventoryProps {
  onViewDetails?: (inventory: WarehouseInventory) => void;
  itemType?: 'FABRIC' | 'ITEM' | 'PRODUCT'; // Optional filter for item type
}

interface AllocationDetail {
  allocationId: string;
  bomNumber: string;
  orderNumber: string;
  quantity: number;
  unit: string;
  itemName: string;
  allocatedAt: string;
}

interface BinWiseInventoryDetail {
  binId: string;
  binCode: string;
  location: string;
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  unit: string;
}

interface InventorySummaryDetail {
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  unit: string;
  bins: BinWiseInventoryDetail[];
}

const resolveInventoryDisplayName = (item: WarehouseInventory): string => {
  const fabricMaster = (item as any).fabric_master;
  const itemMaster = (item as any).item_master;
  const product = (item as any).product;
  const grnFabricName = item.grn_item?.fabric_name;
  const grnItemName = item.grn_item?.item_name;

  if (item.item_type === 'FABRIC') {
    return (
      (fabricMaster?.fabric_for_supplier && String(fabricMaster.fabric_for_supplier).trim()) ||
      fabricMaster?.fabric_name ||
      item.item_name ||
      grnFabricName ||
      grnItemName ||
      '—'
    );
  }
  if (item.item_type === 'ITEM') {
    return itemMaster?.item_name || item.item_name || grnItemName || grnFabricName || '—';
  }
  if (item.item_type === 'PRODUCT') {
    return product?.name || item.item_name || grnItemName || '—';
  }
  return item.item_name || grnItemName || grnFabricName || '—';
};

const resolveFabricDisplayName = (item: WarehouseInventory): string => {
  const fabricMaster = (item as any).fabric_master;
  return (
    (fabricMaster?.fabric_for_supplier && String(fabricMaster.fabric_for_supplier).trim()) ||
    fabricMaster?.fabric_name ||
    item.grn_item?.fabric_name ||
    item.item_name ||
    '-'
  );
};

export type StorageInventoryColumnId =
  | 'name'
  | 'type'
  | 'fabric'
  | 'color'
  | 'material_gsm'
  | 'brand'
  | 'size'
  | 'total_inventory'
  | 'reserved'
  | 'available'
  | 'status'
  | 'actions';

type StorageInventoryTableFilterKey =
  | 'name'
  | 'type'
  | 'fabric'
  | 'color'
  | 'material_gsm'
  | 'brand'
  | 'size'
  | 'bin_inventory'
  | 'allocated'
  | 'status';

interface StorageInventoryColumnConfig {
  id: StorageInventoryColumnId;
  label: string;
  filterKey?: StorageInventoryTableFilterKey;
  required?: boolean;
}

const STORAGE_INVENTORY_COLUMNS: StorageInventoryColumnConfig[] = [
  { id: 'name', label: 'Name', filterKey: 'name', required: true },
  { id: 'type', label: 'Type', filterKey: 'type' },
  { id: 'fabric', label: 'Fabric', filterKey: 'fabric' },
  { id: 'color', label: 'Color', filterKey: 'color' },
  { id: 'material_gsm', label: 'Material/GSM', filterKey: 'material_gsm' },
  { id: 'brand', label: 'Brand', filterKey: 'brand' },
  { id: 'size', label: 'Size', filterKey: 'size' },
  { id: 'total_inventory', label: 'Total Inventory', filterKey: 'bin_inventory' },
  { id: 'reserved', label: 'Reserved', filterKey: 'allocated' },
  { id: 'available', label: 'Available' },
  { id: 'status', label: 'Status', filterKey: 'status' },
  { id: 'actions', label: 'Actions', required: true },
];

const STORAGE_INVENTORY_COLUMN_ORDER: StorageInventoryColumnId[] = STORAGE_INVENTORY_COLUMNS.map((c) => c.id);

const COLUMN_CONFIG_BY_ID: Record<StorageInventoryColumnId, StorageInventoryColumnConfig> =
  STORAGE_INVENTORY_COLUMNS.reduce(
    (acc, c) => {
      acc[c.id] = c;
      return acc;
    },
    {} as Record<StorageInventoryColumnId, StorageInventoryColumnConfig>
  );

const DEFAULT_STORAGE_INVENTORY_VISIBILITY: Record<StorageInventoryColumnId, boolean> =
  STORAGE_INVENTORY_COLUMNS.reduce(
    (acc, c) => {
      acc[c.id] = true;
      return acc;
    },
    {} as Record<StorageInventoryColumnId, boolean>
  );

const DEFAULT_STORAGE_INVENTORY_WIDTHS: Record<StorageInventoryColumnId, number> = {
  name: 240,
  type: 112,
  fabric: 160,
  color: 140,
  material_gsm: 140,
  brand: 110,
  size: 96,
  total_inventory: 128,
  reserved: 108,
  available: 108,
  status: 120,
  actions: 200,
};

const STORAGE_TABLE_PREFS_PREFIX = 'fabric-flow.storage-zone-inventory.table';

function storageInventoryTablePrefsKey(itemType: 'FABRIC' | 'ITEM' | 'PRODUCT' | undefined): string {
  return `${STORAGE_TABLE_PREFS_PREFIX}:${itemType ?? 'RAW'}`;
}

interface StoredStorageInventoryTablePrefs {
  visibility?: Partial<Record<StorageInventoryColumnId, boolean>>;
  widths?: Partial<Record<StorageInventoryColumnId, number>>;
}

function readStorageInventoryTablePrefs(
  itemType: 'FABRIC' | 'ITEM' | 'PRODUCT' | undefined
): StoredStorageInventoryTablePrefs | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageInventoryTablePrefsKey(itemType));
    if (!raw) return null;
    return JSON.parse(raw) as StoredStorageInventoryTablePrefs;
  } catch {
    return null;
  }
}

function writeStorageInventoryTablePrefs(
  itemType: 'FABRIC' | 'ITEM' | 'PRODUCT' | undefined,
  prefs: StoredStorageInventoryTablePrefs
) {
  try {
    localStorage.setItem(storageInventoryTablePrefsKey(itemType), JSON.stringify(prefs));
  } catch {
    // ignore quota / private mode
  }
}

function mergeStorageInventoryVisibility(
  partial: Partial<Record<StorageInventoryColumnId, boolean>> | undefined
): Record<StorageInventoryColumnId, boolean> {
  return { ...DEFAULT_STORAGE_INVENTORY_VISIBILITY, ...partial };
}

function mergeStorageInventoryWidths(
  partial: Partial<Record<StorageInventoryColumnId, number>> | undefined
): Record<StorageInventoryColumnId, number> {
  const out = { ...DEFAULT_STORAGE_INVENTORY_WIDTHS };
  if (!partial) return out;
  for (const col of STORAGE_INVENTORY_COLUMN_ORDER) {
    const w = partial[col];
    if (typeof w === 'number' && Number.isFinite(w)) {
      out[col] = Math.min(560, Math.max(48, Math.round(w)));
    }
  }
  return out;
}

function ColumnResizeHandle({ onResize }: { onResize: (delta: number) => void }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize column"
      className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize select-none hover:bg-primary/20"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        let lastX = e.clientX;
        const onMove = (ev: PointerEvent) => {
          const dx = ev.clientX - lastX;
          lastX = ev.clientX;
          if (dx !== 0) onResize(dx);
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      }}
    />
  );
}

export const StorageZoneInventory: React.FC<StorageZoneInventoryProps> = ({
  onViewDetails,
  itemType,
}) => {
  const [inventory, setInventory] = useState<WarehouseInventory[]>([]);
  const [binSummaries, setBinSummaries] = useState<BinInventorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [itemTypeFilter, setItemTypeFilter] = useState<string>('all');
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [selectedInventoryForLogs, setSelectedInventoryForLogs] = useState<WarehouseInventory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WarehouseInventory | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);
  const [selectedAllocationDetails, setSelectedAllocationDetails] = useState<{
    inventory: WarehouseInventory;
    details: AllocationDetail[];
  } | null>(null);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [selectedSummaryDetails, setSelectedSummaryDetails] = useState<{
    inventory: WarehouseInventory;
    summary: InventorySummaryDetail;
  } | null>(null);
  const [columnFilters, setColumnFilters] = useState({
    name: '',
    type: '',
    fabric: '',
    color: '',
    material_gsm: '',
    brand: '',
    size: '',
    bin_inventory: '',
    allocated: '',
    status: '',
  });
  const [filterDialogColumn, setFilterDialogColumn] = useState<keyof typeof columnFilters | null>(null);
  const [columnsPickerOpen, setColumnsPickerOpen] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<Record<StorageInventoryColumnId, boolean>>(() =>
    mergeStorageInventoryVisibility(readStorageInventoryTablePrefs(itemType)?.visibility)
  );
  const [columnWidths, setColumnWidths] = useState<Record<StorageInventoryColumnId, number>>(() =>
    mergeStorageInventoryWidths(readStorageInventoryTablePrefs(itemType)?.widths)
  );
  const skipNextTablePrefsPersist = useRef(false);

  useEffect(() => {
    skipNextTablePrefsPersist.current = true;
    const stored = readStorageInventoryTablePrefs(itemType);
    setColumnVisibility(mergeStorageInventoryVisibility(stored?.visibility));
    setColumnWidths(mergeStorageInventoryWidths(stored?.widths));
  }, [itemType]);

  useEffect(() => {
    if (skipNextTablePrefsPersist.current) {
      skipNextTablePrefsPersist.current = false;
      return;
    }
    writeStorageInventoryTablePrefs(itemType, {
      visibility: columnVisibility,
      widths: columnWidths,
    });
  }, [itemType, columnVisibility, columnWidths]);

  const visibleColumnIds = useMemo(
    () => STORAGE_INVENTORY_COLUMN_ORDER.filter((id) => columnVisibility[id]),
    [columnVisibility]
  );

  const bumpColumnWidth = useCallback((id: StorageInventoryColumnId, delta: number) => {
    setColumnWidths((prev) => {
      const cur = prev[id];
      const next = Math.min(560, Math.max(48, cur + delta));
      if (next === cur) return prev;
      return { ...prev, [id]: next };
    });
  }, []);

  const colStyle = useCallback(
    (id: StorageInventoryColumnId): React.CSSProperties => ({
      width: columnWidths[id],
      minWidth: columnWidths[id],
    }),
    [columnWidths]
  );

  const setColumnShown = useCallback((id: StorageInventoryColumnId, shown: boolean) => {
    if (COLUMN_CONFIG_BY_ID[id]?.required && !shown) return;
    setColumnVisibility((prev) => {
      const next = { ...prev, [id]: shown };
      const count = STORAGE_INVENTORY_COLUMN_ORDER.filter((c) => next[c]).length;
      if (count < 1) return prev;
      return next;
    });
  }, []);

  const resetTableLayout = useCallback(() => {
    setColumnVisibility({ ...DEFAULT_STORAGE_INVENTORY_VISIBILITY });
    setColumnWidths({ ...DEFAULT_STORAGE_INVENTORY_WIDTHS });
  }, []);

  const loadInventory = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('warehouse_inventory')
        .select(`
          *,
          bin:bin_id (
            id,
            bin_code,
            location_type,
            rack:rack_id (
              id,
              rack_code,
              floor:floor_id (
                id,
                floor_number,
                warehouse:warehouse_id (
                  id,
                  name,
                  code
                )
              )
            )
          )
          ,grn_item:grn_item_id (
            po_item_id,
            fabric_color,
            fabric_gsm,
            fabric_name,
            item_color,
            item_name,
            item_image_url,
            unit_of_measure,
            received_quantity,
            approved_quantity,
            rejected_quantity,
            gst_rate,
            gst_amount,
            line_total,
            batch_number,
            expiry_date,
            condition_notes,
            inspection_notes
          )
        `)
        .in('status', ['IN_STORAGE', 'READY_TO_DISPATCH'] as any);
      
      // Filter by item_type if provided
      if (itemType) {
        query = query.eq('item_type', itemType);
      } else {
        // Exclude PRODUCT items - only show FABRIC and ITEM for Raw Material inventory
        query = query.in('item_type', ['FABRIC', 'ITEM'] as any);
      }
      
      const { data, error } = await query
        .order('moved_to_storage_date', { ascending: false })
        .order('bin_id', { ascending: true });

      if (error) throw error;
      
      // Debug: Log raw data from DB
      console.log('🔍 [StorageZone] Raw data from DB:', data?.length || 0);
      
      const filtered = ((data as any) || []).filter((i: any) => {
        const lt = i?.bin?.location_type;
        const st = i?.status;
        const inStorageBin = st === 'IN_STORAGE' && lt === 'STORAGE';
        const readyOnLegacyDispatchBin = st === 'READY_TO_DISPATCH' && lt === 'DISPATCH_ZONE';
        const include = inStorageBin || readyOnLegacyDispatchBin;
        if (!include && itemType === 'PRODUCT') {
          console.warn('⚠️ [StorageZone] Excluded row:', i.bin?.bin_code, 'location_type:', lt, 'status:', st);
        }
        return include;
      });
      
      // Debug: Log after bin filter
      console.log('🔍 [StorageZone] After bin filter:', filtered.length);
      
      // Fetch item_master and fabric_master data for FABRIC and ITEM types
      const poItemIdsNeedingFabricFallback = Array.from(
        new Set(
          filtered
            .filter((i: any) => i.item_type === 'FABRIC' && !i.item_id && i.grn_item?.po_item_id)
            .map((i: any) => String(i.grn_item?.po_item_id || '').trim())
            .filter(Boolean)
        )
      ) as string[];
      const poFabricMap = new Map<string, string>();
      if (poItemIdsNeedingFabricFallback.length > 0) {
        const { data: poItemsData } = await supabase
          .from('purchase_order_items')
          .select('id, fabric_id')
          .in('id', poItemIdsNeedingFabricFallback as any);
        (poItemsData || []).forEach((row: any) => {
          const poItemId = String(row?.id || '').trim();
          const fabricId = String(row?.fabric_id || '').trim();
          if (poItemId && fabricId) poFabricMap.set(poItemId, fabricId);
        });
      }

      const fabricIds = Array.from(
        new Set(
          filtered
            .filter((i: any) => i.item_type === 'FABRIC')
            .map((i: any) => {
              return String(
                resolveWarehouseFabricId(
                  {
                    item_id: i.item_id,
                    grn_item_po_item_id: i.grn_item?.po_item_id,
                  },
                  poFabricMap
                ) || ''
              ).trim();
            })
            .filter(Boolean)
        )
      ) as string[];
      
      const itemIds = filtered
        .filter((i: any) => i.item_type === 'ITEM' && i.item_id)
        .map((i: any) => i.item_id) as string[];
      
      const productIds = filtered
        .filter((i: any) => i.item_type === 'PRODUCT' && i.item_id)
        .map((i: any) => i.item_id) as string[];
      
      // Fetch fabric_master data by ID
      let fabricMap = new Map<string, any>();
      if (fabricIds.length > 0) {
        const { data: fabricsData, error: fabricsError } = await supabase
          .from('fabric_master')
          .select('id, fabric_code, fabric_name, color, type, gsm, image, hex, fabric_for_supplier')
          .in('id', fabricIds);
        
        if (!fabricsError && fabricsData) {
          fabricsData.forEach((fabric: any) => {
            fabricMap.set(fabric.id, fabric);
          });
          console.log('✅ [StorageZone] Fetched fabrics by ID:', fabricsData.length, 'fabricIds requested:', fabricIds.length);
        } else {
          console.warn('⚠️ [StorageZone] Error fetching fabrics by ID:', fabricsError);
        }
      }
      
      // Fetch item_master data
      let itemMasterMap = new Map<string, any>();
      if (itemIds.length > 0) {
        const { data: itemsData, error: itemsError } = await supabase
          .from('item_master')
          .select('id, item_code, item_name, item_type, material, brand, color, size, image')
          .in('id', itemIds);
        
        if (!itemsError && itemsData) {
          itemsData.forEach((item: any) => {
            itemMasterMap.set(item.id, item);
          });
        }
      }
      
      // Fetch product_master data separately if item_type is PRODUCT
      let productMap = new Map<string, any>();
      if (itemType === 'PRODUCT' && productIds.length > 0) {
        const { data: productsData, error: productsError } = await supabase
          .from('product_master')
          .select('id, sku, class, size, name, brand, category, main_image, image_url, image1, image2, images')
          .in('id', productIds);
        
        if (!productsError && productsData) {
          productsData.forEach((product: any) => {
            productMap.set(product.id, product);
          });
        }
      }
      
      // Merge master data into inventory items
      const inventoryWithMasters = filtered.map((item: any) => {
        if (item.item_type === 'FABRIC') {
          const fabricRefId = String(
            resolveWarehouseFabricId(
              {
                item_id: item.item_id,
                grn_item_po_item_id: item.grn_item?.po_item_id,
              },
              poFabricMap
            ) || ''
          ).trim();
          if (fabricRefId && fabricMap.has(fabricRefId)) {
            return {
              ...item,
              item_id: item.item_id || fabricRefId,
              fabric_master: fabricMap.get(fabricRefId)
            };
          }
          // Debug log if fabric not found
          if (!item.item_id) {
            console.warn('⚠️ [StorageZone] Fabric item without item_id:', item.item_name, 'fabric_name:', item.grn_item?.fabric_name);
          } else {
            console.warn('⚠️ [StorageZone] Fabric not found in fabricMap for item_id:', item.item_id, 'item_name:', item.item_name);
          }
        } else if (item.item_type === 'ITEM' && item.item_id && itemMasterMap.has(item.item_id)) {
          return {
            ...item,
            item_master: itemMasterMap.get(item.item_id)
          };
        } else if (item.item_type === 'PRODUCT' && item.item_id && productMap.has(item.item_id)) {
          return {
            ...item,
            product: productMap.get(item.item_id)
          };
        }
        return item;
      });
      
      // Debug: Log after master data merge
      console.log('🔍 [StorageZone] After master data merge:', inventoryWithMasters.length);
      
      // Debug: Group inventory by item_id for PRODUCT type to verify all bins
      if (itemType === 'PRODUCT') {
        const groupedByItemId = inventoryWithMasters.reduce((acc: any, item: any) => {
          const key = item.item_id;
          if (!acc[key]) acc[key] = [];
          acc[key].push({
            bin: item.bin?.bin_code,
            quantity: item.quantity,
            bin_id: item.bin_id,
            inventory_id: item.id
          });
          return acc;
        }, {});
        console.log('📦 [StorageZone] Inventory grouped by item_id:', groupedByItemId);
      }
      
      // For PRODUCT type, don't consolidate - show separate rows for each bin
      // For other types, consolidate as before
      let processedInventory;
      if (itemType === 'PRODUCT') {
        // Don't consolidate - show all rows separately
        processedInventory = inventoryWithMasters as WarehouseInventory[];
      } else {
      // Consolidate duplicate items before displaying
        processedInventory = consolidateInventory(inventoryWithMasters as WarehouseInventory[]);
      }
      
      // Debug: Log final processed inventory
      console.log('🔍 [StorageZone] Final inventory:', processedInventory.length);
      
      const inventoryWithAllocations = await attachAllocationData(processedInventory as any);

      setInventory(inventoryWithAllocations as any);

      const summaries = createBinSummaries(inventoryWithAllocations as any);
      setBinSummaries(summaries);
    } catch (error) {
      console.error('Error loading storage inventory:', error);
      toast.error('Failed to load storage zone inventory');
    } finally {
      setLoading(false);
    }
  };

  // Consolidate duplicate items (same item_id/code+name, bin, status, unit, color)
  const consolidateInventory = (inventoryData: WarehouseInventory[]): (WarehouseInventory & { consolidatedIds?: string[] })[] => {
    const consolidatedMap = new Map<string, WarehouseInventory & { consolidatedIds: string[] }>();

    inventoryData.forEach(item => {
      // Create a unique key for matching items
      const itemColor = item.grn_item?.item_color || item.grn_item?.fabric_color || '';
      const itemGsm =
        item.item_type === 'FABRIC'
          ? String((item as any).fabric_master?.gsm ?? item.grn_item?.fabric_gsm ?? '')
          : '';
      const key = buildWarehouseIdentityKey({
        itemType: item.item_type,
        itemId: item.item_id,
        itemCode: item.item_code,
        itemName: item.item_name,
        binId: item.bin_id,
        status: item.status,
        unit: item.unit,
        color: itemColor,
        gsm: itemGsm,
      });

      const existing = consolidatedMap.get(key);
      
      if (existing) {
        // Consolidate: sum quantities and keep most recent entry's metadata
        existing.quantity = existing.quantity + item.quantity;
        existing.consolidatedIds.push(item.id);
        
        // Keep the most recent moved_to_storage_date
        if (item.moved_to_storage_date && existing.moved_to_storage_date) {
          const existingDate = new Date(existing.moved_to_storage_date);
          const newDate = new Date(item.moved_to_storage_date);
          if (newDate > existingDate) {
            existing.moved_to_storage_date = item.moved_to_storage_date;
          }
        } else if (item.moved_to_storage_date) {
          existing.moved_to_storage_date = item.moved_to_storage_date;
        }
      } else {
        // First occurrence of this item
        consolidatedMap.set(key, {
          ...item,
          consolidatedIds: [item.id]
        });
      }
    });

    // Return consolidated items (keep consolidatedIds for logs modal)
    return Array.from(consolidatedMap.values());
  };

  const createBinSummaries = (inventoryData: WarehouseInventory[]): BinInventorySummary[] => {
    const binMap = new Map<string, BinInventorySummary>();
    inventoryData.forEach(item => {
      if (!item.bin) return;
      const binId = item.bin.id;
      const existing = binMap.get(binId);
      if (existing) {
        existing.total_items++;
        existing.total_quantity += item.quantity;
        existing.items.push(item);
      } else {
        const warehousePath = item.bin.rack?.floor?.warehouse 
          ? `${item.bin.rack.floor.warehouse.name} > Floor ${item.bin.rack.floor.floor_number} > ${item.bin.rack.rack_code} > ${item.bin.bin_code}`
          : `${item.bin.bin_code}`;
        binMap.set(binId, {
          bin_id: binId,
          bin_code: item.bin.bin_code,
          location_type: item.bin.location_type,
          total_items: 1,
          total_quantity: item.quantity,
          items: [item],
          warehouse_path: warehousePath
        });
      }
    });
    return Array.from(binMap.values());
  };

  const attachAllocationData = async (
    inventoryData: (WarehouseInventory & { consolidatedIds?: string[] })[]
  ): Promise<(WarehouseInventory & { allocated_quantity?: number; allocation_details?: AllocationDetail[] })[]> => {
    const inventoryIdSet = new Set<string>();

    inventoryData.forEach((item) => {
      const ids = (item as any).consolidatedIds?.length ? (item as any).consolidatedIds : [item.id];
      ids.forEach((id: string) => inventoryIdSet.add(id));
    });

    if (inventoryIdSet.size === 0) {
      return inventoryData.map((item) => ({
        ...item,
        allocated_quantity: 0,
        allocation_details: []
      }));
    }

    try {
      const { data, error } = await supabase
        .from('inventory_allocations' as any)
        .select(`
          id,
          warehouse_inventory_id,
          quantity,
          unit,
          created_at,
          bom_item:bom_item_id (
            id,
            item_name,
            bom:bom_id (
              id,
              bom_number,
              order:order_id (
                order_number
              )
            )
          )
        `)
        .in('warehouse_inventory_id', Array.from(inventoryIdSet));

      if (error) {
        console.warn('Failed to load allocation data for inventory items', error);
        return inventoryData.map((item) => ({
          ...item,
          allocated_quantity: 0,
          allocation_details: []
        }));
      }

      const allocationMap = new Map<string, { total: number; details: AllocationDetail[] }>();

      (data || []).forEach((row: any) => {
        const inventoryId = row.warehouse_inventory_id;
        const quantity = Number(row.quantity || 0);
        const unit = row.unit || '';
        const bomItem = row.bom_item || {};
        const bom = bomItem?.bom || {};
        const order = bom?.order || {};

        const detail: AllocationDetail = {
          allocationId: row.id,
          quantity,
          unit,
          bomNumber: bom?.bom_number || '—',
          orderNumber: order?.order_number || '—',
          itemName: bomItem?.item_name || '—',
          allocatedAt: row.created_at
        };

        const existing = allocationMap.get(inventoryId) || { total: 0, details: [] };
        existing.total += quantity;
        existing.details.push(detail);
        allocationMap.set(inventoryId, existing);
      });

      return inventoryData.map((item) => {
        const ids = (item as any).consolidatedIds?.length ? (item as any).consolidatedIds : [item.id];
        let totalAllocated = 0;
        let details: AllocationDetail[] = [];

        ids.forEach((id: string) => {
          const entry = allocationMap.get(id);
          if (entry) {
            totalAllocated += entry.total;
            details = details.concat(entry.details);
          }
        });

        return {
          ...item,
          allocated_quantity: totalAllocated,
          allocation_details: details
        };
      });
    } catch (error) {
      console.error('Unexpected error while attaching allocation data', error);
      return inventoryData.map((item) => ({
        ...item,
        allocated_quantity: 0,
        allocation_details: []
      }));
    }
  };

  const warehouseNames = useMemo(() => {
    const s = new Set<string>();
    inventory.forEach((i) => {
      const n = i.bin?.rack?.floor?.warehouse?.name;
      if (n) s.add(n);
    });
    return Array.from(s).sort();
  }, [inventory]);

  const includesFilter = (value: unknown, filterValue: string) =>
    filterValue.trim() === '' || String(value ?? '').toLowerCase().includes(filterValue.trim().toLowerCase());

  const summarizeInventoryKey = (item: WarehouseInventory) => {
    const itemColor = item.grn_item?.item_color || item.grn_item?.fabric_color || '';
    const itemGsm =
      item.item_type === 'FABRIC'
        ? String((item as any).fabric_master?.gsm ?? item.grn_item?.fabric_gsm ?? '')
        : '';
    // Intentionally exclude bin/status so this becomes a per-item summary across bins.
    return buildWarehouseIdentityKey({
      itemType: item.item_type,
      itemId: item.item_id,
      itemCode: item.item_code,
      itemName: item.item_name,
      unit: item.unit,
      color: itemColor,
      gsm: itemGsm,
    });
  };

  const inventorySummaryMap = useMemo(() => {
    const map = new Map<string, InventorySummaryDetail>();

    inventory.forEach((item) => {
      const key = summarizeInventoryKey(item);
      const qty = Number(item.quantity || 0);
      const reserved = Number((item as any).allocated_quantity || 0);
      const available = Math.max(qty - reserved, 0);
      const binCode = item.bin?.bin_code || 'Unknown Bin';
      const location =
        item.bin?.rack?.floor?.warehouse?.name
          ? `${item.bin?.rack?.floor?.warehouse?.name} > Floor ${item.bin?.rack?.floor?.floor_number} > ${item.bin?.rack?.rack_code}`
          : '—';

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          totalQuantity: qty,
          reservedQuantity: reserved,
          availableQuantity: available,
          unit: item.unit,
          bins: [
            {
              binId: item.bin_id,
              binCode,
              location,
              totalQuantity: qty,
              reservedQuantity: reserved,
              availableQuantity: available,
              unit: item.unit,
            },
          ],
        });
        return;
      }

      existing.totalQuantity += qty;
      existing.reservedQuantity += reserved;
      existing.availableQuantity += available;

      const existingBin = existing.bins.find((b) => b.binId === item.bin_id);
      if (existingBin) {
        existingBin.totalQuantity += qty;
        existingBin.reservedQuantity += reserved;
        existingBin.availableQuantity += available;
      } else {
        existing.bins.push({
          binId: item.bin_id,
          binCode,
          location,
          totalQuantity: qty,
          reservedQuantity: reserved,
          availableQuantity: available,
          unit: item.unit,
        });
      }
    });

    return map;
  }, [inventory]);

  const columnCellValue = (item: WarehouseInventory, key: keyof typeof columnFilters): string => {
    const fabricMaster = (item as any).fabric_master;
    const itemMaster = (item as any).item_master;
    const product = (item as any).product;
    const lineFabricColor = item.grn_item?.fabric_color;
    const lineItemColor = item.grn_item?.item_color;
    const allocatedQuantity = Number((item as any).allocated_quantity || 0);
    const availableQuantity = Math.max(Number(item.quantity || 0) - allocatedQuantity, 0);
    const qtyNum = Number(item.quantity || 0);

    switch (key) {
      case 'name':
        return resolveInventoryDisplayName(item);
      case 'type':
        if (item.item_type === 'FABRIC') return 'Fabric';
        if (item.item_type === 'ITEM' && itemMaster) return itemMaster.item_type || '';
        if (item.item_type === 'PRODUCT' && product) return product.class || '';
        return item.item_type || '';
      case 'fabric':
        if (item.item_type === 'FABRIC') return resolveFabricDisplayName(item);
        return '';
      case 'color':
        if (item.item_type === 'FABRIC' && fabricMaster) return lineFabricColor || fabricMaster.color || '';
        if (item.item_type === 'ITEM' && itemMaster) return lineItemColor || itemMaster.color || '';
        return lineFabricColor || lineItemColor || '';
      case 'material_gsm':
        if (item.item_type === 'FABRIC' && fabricMaster) {
          const material = fabricMaster.type || '';
          const gsm = fabricMaster.gsm || '';
          return material && gsm ? `${material} ${gsm} GSM` : material || gsm || '';
        }
        if (item.item_type === 'ITEM' && itemMaster) return itemMaster.material || '';
        return item.grn_item?.fabric_gsm || '';
      case 'brand':
        if (item.item_type === 'ITEM' && itemMaster) return itemMaster.brand || '';
        if (item.item_type === 'PRODUCT' && product) return product.brand || '';
        return '';
      case 'size':
        if (item.item_type === 'ITEM' && itemMaster) return itemMaster.size || '';
        if (item.item_type === 'PRODUCT' && product) return product.size || '';
        return '';
      case 'bin_inventory':
        return `${item.bin?.bin_code || ''} total ${item.quantity} ${item.unit} available ${availableQuantity} ${item.unit} allocated ${allocatedQuantity} ${item.unit} ${item.bin?.rack?.floor?.warehouse?.name || ''} floor ${item.bin?.rack?.floor?.floor_number || ''} ${item.bin?.rack?.rack_code || ''}`;
      case 'allocated':
        return `${allocatedQuantity} ${item.unit || ''}`;
      case 'status':
        if (item.status === 'IN_STORAGE') {
          if (availableQuantity <= 0 && qtyNum > 0) return 'Allocated';
          if (availableQuantity > 0 && qtyNum > 0 && availableQuantity / qtyNum < 0.25) return 'Low Stock';
          return 'Available';
        }
        return item.status || '';
      default:
        return '';
    }
  };

  const hasActiveColumnFilters = Object.values(columnFilters).some((value) => value.trim() !== '');

  const filteredInventory = inventory.filter((item) => {
    const t = searchTerm.trim().toLowerCase();
    const resolvedName = resolveInventoryDisplayName(item).toLowerCase();
    const matchesSearch =
      t === '' ||
      resolvedName.includes(t) ||
      (item.item_name || '').toLowerCase().includes(t) ||
      (item.item_code || '').toLowerCase().includes(t) ||
      (item.bin?.bin_code || '').toLowerCase().includes(t) ||
      (() => {
        const fm = (item as any).fabric_master;
        if (fm) {
          return (
            (fm.fabric_code || '').toLowerCase().includes(t) ||
            (fm.fabric_name || '').toLowerCase().includes(t)
          );
        }
        const im = (item as any).item_master;
        if (im) {
          return (
            (im.item_code || '').toLowerCase().includes(t) ||
            (im.item_name || '').toLowerCase().includes(t)
          );
        }
        return false;
      })();
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchesItemType = itemTypeFilter === 'all' || item.item_type === itemTypeFilter;
    const wh = item.bin?.rack?.floor?.warehouse?.name || '';
    const matchesZone = zoneFilter === 'all' || wh === zoneFilter;
    const matchesColumns = (Object.keys(columnFilters) as Array<keyof typeof columnFilters>).every((columnKey) =>
      includesFilter(columnCellValue(item, columnKey), columnFilters[columnKey])
    );
    return matchesSearch && matchesStatus && matchesItemType && matchesZone && matchesColumns;
  });

  const handleExportReport = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = [
      'Name',
      'Type',
      'Bin',
      'Quantity',
      'Unit',
      'Status',
      'Warehouse path',
    ];
    const lines = filteredInventory.map((item) => [
      item.item_name,
      item.item_type,
      item.bin?.bin_code ?? '',
      String(item.quantity),
      item.unit,
      item.status,
      [
        item.bin?.rack?.floor?.warehouse?.name,
        `Floor ${item.bin?.rack?.floor?.floor_number ?? ''}`,
        item.bin?.rack?.rack_code,
      ]
        .filter(Boolean)
        .join(' > '),
    ]);
    const csv = [header.join(','), ...lines.map((row) => row.map(esc).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storage-zone-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported');
  };

  useEffect(() => {
    loadInventory();
    const handler = () => loadInventory();
    window.addEventListener('warehouse-inventory-updated', handler as any);
    // Live updates: listen to realtime changes for storage items
    const channel = supabase
      .channel('storage_inventory_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_inventory' } as any, () => {
        loadInventory();
      })
      .subscribe();

    const allocationChannel = supabase
      .channel('storage_inventory_allocations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_allocations' } as any, () => {
        loadInventory();
      })
      .subscribe();

    return () => {
      window.removeEventListener('warehouse-inventory-updated', handler as any);
      try { supabase.removeChannel(channel); } catch {}
      try { supabase.removeChannel(allocationChannel); } catch {}
    };
  }, []);

  const handleOpenAllocationDetails = (inventoryItem: WarehouseInventory) => {
    const details = (inventoryItem as any).allocation_details || [];
    setSelectedAllocationDetails({ inventory: inventoryItem, details });
    setAllocationModalOpen(true);
  };

  const handleOpenInventorySummaryDetails = (inventoryItem: WarehouseInventory) => {
    const summary = inventorySummaryMap.get(summarizeInventoryKey(inventoryItem));
    if (!summary) return;
    setSelectedSummaryDetails({ inventory: inventoryItem, summary });
    setSummaryModalOpen(true);
  };

  const getStatusConfig = (status: string) => {
    return INVENTORY_STATUS_CONFIGS[status as keyof typeof INVENTORY_STATUS_CONFIGS] || INVENTORY_STATUS_CONFIGS.IN_STORAGE;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading storage zone inventory...</p>
        </div>
      </div>
    );
  }

  const totalQtyRaw = inventory.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const totalAllocatedQty = inventory.reduce(
    (sum, item) => sum + Number((item as any).allocated_quantity || 0),
    0
  );
  const primaryUnit = inventory[0]?.unit || '';

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-[#e5e7eb] bg-white p-5 sm:p-6 flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3 items-start min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#dcfce7]">
              <Archive className="h-5 w-5 text-green-700" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold leading-7 tracking-tight text-[#101828]">
                Storage Zone Inventory
              </h3>
              <p className="text-sm text-[#6a7282]">
                Items currently stored in warehouse storage bins
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-2 rounded-lg border-black/10 bg-white text-[#0a0a0a] hover:bg-[#fafafa]"
            onClick={handleExportReport}
          >
            <Download className="h-4 w-4" />
            Export Report
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div
            className="relative overflow-hidden rounded-[10px] border border-[#bedbff] p-4"
            style={{
              background: 'linear-gradient(164.271deg, rgb(239, 246, 255) 0%, rgb(219, 234, 254) 100%)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#155dfc]">
                <Package className="h-5 w-5 text-white" />
              </div>
              <p className="text-sm font-medium text-[#4a5565]">Total Items</p>
            </div>
            <p className="mt-3 text-[30px] font-bold leading-9 tracking-tight text-[#101828]">
              {inventory.length}
            </p>
            <p className="mt-1 text-sm text-[#4a5565]">Items in storage</p>
          </div>

          <div
            className="relative overflow-hidden rounded-[10px] border border-[#b9f8cf] p-4"
            style={{
              background: 'linear-gradient(164.271deg, rgb(240, 253, 244) 0%, rgb(220, 252, 231) 100%)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#00a63e]">
                <Archive className="h-5 w-5 text-white" />
              </div>
              <p className="text-sm font-medium text-[#4a5565]">Bins Used</p>
            </div>
            <p className="mt-3 text-[30px] font-bold leading-9 tracking-tight text-[#101828]">
              {binSummaries.length}
            </p>
            <p className="mt-1 text-sm text-[#4a5565]">Storage locations</p>
          </div>

          <div
            className="relative overflow-hidden rounded-[10px] border border-[#e9d4ff] p-4"
            style={{
              background: 'linear-gradient(164.271deg, rgb(250, 245, 255) 0%, rgb(243, 232, 255) 100%)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#9810fa]">
                <Truck className="h-5 w-5 text-white" />
              </div>
              <p className="text-sm font-medium text-[#4a5565]">Total Quantity</p>
            </div>
            <p className="mt-3 text-[30px] font-bold leading-9 tracking-tight text-[#101828]">
              {Math.round(totalQtyRaw)}
              {primaryUnit ? ` ${primaryUnit}` : ''}
            </p>
            <p className="mt-1 text-sm text-[#4a5565]">
              {Math.round(totalAllocatedQty)}
              {primaryUnit ? ` ${primaryUnit}` : ''} allocated
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-[14px] border border-[#e5e7eb] bg-white px-4 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#717182]" />
            <Input
              placeholder="Search by name, code, or location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 rounded-lg border-0 bg-[#f3f3f5] pl-10 pr-3 text-sm text-[#0a0a0a] placeholder:text-[#717182]"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-full rounded-lg border-0 bg-[#f3f3f5] sm:w-[160px] text-[#0a0a0a]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="IN_STORAGE">In Storage</SelectItem>
                <SelectItem value="READY_TO_DISPATCH">Ready to Dispatch</SelectItem>
                <SelectItem value="DISPATCHED">Dispatched</SelectItem>
                <SelectItem value="QUARANTINED">Quarantined</SelectItem>
              </SelectContent>
            </Select>

            <Select value={itemTypeFilter} onValueChange={setItemTypeFilter}>
              <SelectTrigger className="h-9 w-full rounded-lg border-0 bg-[#f3f3f5] sm:w-[160px] text-[#0a0a0a]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="FABRIC">Fabric</SelectItem>
                <SelectItem value="ITEM">Item</SelectItem>
              </SelectContent>
            </Select>

            <Select value={zoneFilter} onValueChange={setZoneFilter}>
              <SelectTrigger className="h-9 w-full rounded-lg border-0 bg-[#f3f3f5] sm:w-[160px] text-[#0a0a0a]">
                <SelectValue placeholder="All Zones" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Zones</SelectItem>
                {warehouseNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasActiveColumnFilters && (
              <Button
                variant="outline"
                onClick={() =>
                  setColumnFilters({
                    name: '',
                    type: '',
                    fabric: '',
                    color: '',
                    material_gsm: '',
                    brand: '',
                    size: '',
                    bin_inventory: '',
                    allocated: '',
                    status: '',
                  })
                }
              >
                Clear column filters
              </Button>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold leading-7 tracking-tight text-[#101828]">Inventory Items</h3>
            <p className="text-sm text-[#6a7282]">
              Showing {filteredInventory.length} of {inventory.length} items
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-2 rounded-lg border-black/10 bg-white text-[#0a0a0a] hover:bg-[#fafafa]"
            onClick={() => setColumnsPickerOpen(true)}
          >
            <Columns3 className="h-4 w-4" />
            Columns
          </Button>
        </div>
        <div className="overflow-x-auto rounded-[14px] border border-[#e5e7eb] bg-white">
          <Table className="table-fixed min-w-max">
              <TableHeader>
                <TableRow className="border-b border-black/10 bg-[#f9fafb] hover:bg-[#f9fafb]">
                  {visibleColumnIds.map((colId) => {
                    const cfg = COLUMN_CONFIG_BY_ID[colId];
                    const fk = cfg.filterKey;
                    const filterActive = fk ? Boolean(columnFilters[fk]) : false;
                    return (
                      <TableHead
                        key={colId}
                        className={cn(
                          'relative text-[#0a0a0a] font-medium',
                          colId === 'actions' && 'text-right'
                        )}
                        style={colStyle(colId)}
                      >
                        <div
                          className={cn(
                            'flex items-center gap-1 pr-3',
                            colId === 'actions' && 'justify-end'
                          )}
                        >
                          <span
                            className={cn(
                              colId === 'actions' ? '' : 'min-w-0 flex-1 truncate text-left'
                            )}
                          >
                            {cfg.label}
                          </span>
                          {fk ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className={cn(
                                'h-6 w-6 shrink-0',
                                filterActive ? 'text-primary' : 'text-muted-foreground'
                              )}
                              onClick={() => setFilterDialogColumn(fk)}
                            >
                              <Filter className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </div>
                        <ColumnResizeHandle onResize={(d) => bumpColumnWidth(colId, d)} />
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInventory.map((item) => {
                  const statusConfig = getStatusConfig(item.status);

                  // Get master data based on item type
                  const fabricMaster = (item as any).fabric_master;
                  const itemMaster = (item as any).item_master;
                  const product = (item as any).product;
                  
                  // Determine display values based on item type
                  let displayImage: string | undefined;
                  let displayName: string;
                  let displayType: string;
                  let displayFabric: string;
                  let displayColor: string;
                  let displayColorHex: string | null = null;
                  let displayMaterialGsm: string;
                  let displayBrand: string;
                  let displaySize: string;

                  const lineFabricColor = item.grn_item?.fabric_color;
                  const lineItemColor = item.grn_item?.item_color;

                  if (item.item_type === 'FABRIC' && fabricMaster) {
                    displayImage = fabricMaster.image || null;
                    displayName = resolveInventoryDisplayName(item);
                    displayType = 'Fabric';
                    displayFabric = resolveFabricDisplayName(item);
                    displayColor = lineFabricColor || fabricMaster.color || '-';
                    if (!hasMeaningfulColorLabel(displayColor)) displayColor = '-';
                    displayColorHex =
                      displayColor !== '-'
                        ? resolveWarehouseFabricSwatch(displayColor, fabricMaster.hex, lineFabricColor)
                        : null;
                    const material = fabricMaster.type || '';
                    const gsm = fabricMaster.gsm || '';
                    displayMaterialGsm = material && gsm ? `${material} ${gsm} GSM` : material || gsm || '-';
                    displayBrand = '-';
                    displaySize = '-';
                  } else if (item.item_type === 'ITEM' && itemMaster) {
                    displayImage = itemMaster.image || item.grn_item?.item_image_url;
                    displayName = resolveInventoryDisplayName(item);
                    displayType = itemMaster.item_type || '-';
                    displayFabric = '-';
                    displayColor = lineItemColor || itemMaster.color || '-';
                    if (!hasMeaningfulColorLabel(displayColor)) displayColor = '-';
                    displayColorHex =
                      displayColor !== '-' ? resolveSwatchHex(displayColor, null) : null;
                    displayMaterialGsm = itemMaster.material || '-';
                    displayBrand = itemMaster.brand || '-';
                    displaySize = itemMaster.size || '-';
                  } else if (item.item_type === 'PRODUCT' && product) {
                    displayImage = product.main_image || product.image_url || product.image1 || item.grn_item?.item_image_url;
                    displayName = resolveInventoryDisplayName(item);
                    displayType = product.class || '-';
                    displayFabric = '-';
                    displayColor = '-';
                    displayColorHex = null;
                    displayMaterialGsm = '-';
                    displayBrand = product.brand || '-';
                    displaySize = product.size || '-';
                  } else {
                    // Fallback to GRN item data - but check if item_code looks like a URL
                    // For fabric items, don't show mockup images - only show if fabric image exists in database
                    if (item.item_type === 'FABRIC') {
                      displayImage = null; // Don't show mockup images for fabric items
                    } else {
                    displayImage = item.grn_item?.item_image_url;
                    }
                    displayName = resolveInventoryDisplayName(item);
                    displayType = item.item_type === 'FABRIC' ? 'Fabric' : item.item_type || '-';
                    displayFabric = item.item_type === 'FABRIC' ? resolveFabricDisplayName(item) : '-';
                    displayColor = lineFabricColor || lineItemColor || '-';
                    if (!hasMeaningfulColorLabel(displayColor)) displayColor = '-';
                    displayColorHex =
                      displayColor !== '-' ? resolveSwatchHex(displayColor, null) : null;
                    // For fabric items, try to combine material and GSM if available
                    if (item.item_type === 'FABRIC') {
                      // Try to get material from fabric_name or other sources if available
                      const fabricGsm = item.grn_item?.fabric_gsm || '';
                      displayMaterialGsm = fabricGsm ? `${fabricGsm} GSM` : '-';
                    } else {
                      displayMaterialGsm = item.grn_item?.fabric_gsm || '-';
                    }
                    displayBrand = '-';
                    displaySize = '-';
                  }
                  
                  const allocatedQuantity = Number((item as any).allocated_quantity || 0);
                  const availableQuantity = Math.max(Number(item.quantity || 0) - allocatedQuantity, 0);
                  const summary = inventorySummaryMap.get(summarizeInventoryKey(item));
                  const totalInventoryQty = Number(summary?.totalQuantity ?? item.quantity ?? 0);
                  const reservedQty = Number(summary?.reservedQuantity ?? allocatedQuantity);
                  const netQty = Number(summary?.availableQuantity ?? availableQuantity);
                  const summaryUnit = summary?.unit || item.unit;
                  const qtyNum = Number(item.quantity || 0);
                  const lowStock =
                    item.status === 'IN_STORAGE' &&
                    availableQuantity > 0 &&
                    qtyNum > 0 &&
                    availableQuantity / qtyNum < 0.25;

                  let statusBadge: React.ReactNode;
                  if (item.status === 'IN_STORAGE') {
                    if (availableQuantity <= 0 && qtyNum > 0) {
                      statusBadge = (
                        <span className="inline-flex rounded-lg border border-black/10 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950">
                          Allocated
                        </span>
                      );
                    } else if (lowStock) {
                      statusBadge = (
                        <span className="inline-flex rounded-lg border border-black/10 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950">
                          Low Stock
                        </span>
                      );
                    } else {
                      statusBadge = (
                        <span className="inline-flex rounded-lg border border-black/10 bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                          Available
                        </span>
                      );
                    }
                  } else {
                    statusBadge = (
                      <span
                        className={`inline-flex rounded-lg border border-black/10 px-2 py-0.5 text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}
                      >
                        {statusConfig.label}
                      </span>
                    );
                  }

                  return (
                    <TableRow key={`${item.id}-${item.bin_id}`}>
                      {visibleColumnIds.map((colId) => {
                        const st = colStyle(colId);
                        switch (colId) {
                          case 'name':
                            return (
                              <TableCell key={colId} className="max-w-0 align-middle" style={st}>
                                <div className="flex min-w-0 items-center gap-3">
                                  {displayImage ? (
                                    <img
                                      src={displayImage}
                                      alt=""
                                      className="h-10 w-10 shrink-0 rounded-md border border-[#e5e7eb] object-cover"
                                      onError={(e) => {
                                        const img = e.currentTarget as HTMLImageElement;
                                        img.style.display = 'none';
                                      }}
                                    />
                                  ) : (
                                    <div
                                      className="h-10 w-10 shrink-0 rounded-md border border-dashed border-[#e5e7eb] bg-[#f9fafb]"
                                      aria-hidden
                                    />
                                  )}
                                  <span className="truncate text-sm font-medium text-[#101828]">
                                    {displayName || '—'}
                                  </span>
                                </div>
                              </TableCell>
                            );
                          case 'type':
                            return (
                              <TableCell key={colId} className="align-middle" style={st}>
                                {displayType && displayType !== '-' ? (
                                  <span className="inline-flex rounded-lg border border-black/10 bg-white px-2 py-0.5 text-xs font-medium text-[#0a0a0a]">
                                    {displayType}
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </TableCell>
                            );
                          case 'fabric':
                            return (
                              <TableCell key={colId} className="align-middle" style={st}>
                                {displayFabric !== '-' ? displayFabric : '-'}
                              </TableCell>
                            );
                          case 'color':
                            return (
                              <TableCell key={colId} className="align-middle" style={st}>
                                <div className="flex min-w-0 items-center gap-2">
                                  {displayColorHex ? (
                                    <div
                                      className="h-6 w-6 shrink-0 rounded-full border-2 border-[#e5e7eb] shadow-sm"
                                      style={{ backgroundColor: displayColorHex }}
                                      title={displayColor}
                                    />
                                  ) : null}
                                  <span className="truncate text-sm text-[#4a5565]">
                                    {displayColor !== '-' ? displayColor : '—'}
                                  </span>
                                </div>
                              </TableCell>
                            );
                          case 'material_gsm':
                            return (
                              <TableCell key={colId} className="align-middle" style={st}>
                                {displayMaterialGsm !== '-' ? displayMaterialGsm : '-'}
                              </TableCell>
                            );
                          case 'brand':
                            return (
                              <TableCell key={colId} className="align-middle" style={st}>
                                {displayBrand !== '-' ? displayBrand : '-'}
                              </TableCell>
                            );
                          case 'size':
                            return (
                              <TableCell key={colId} className="align-middle" style={st}>
                                {displaySize !== '-' ? (
                                  <Badge variant="outline">{displaySize}</Badge>
                                ) : (
                                  '-'
                                )}
                              </TableCell>
                            );
                          case 'total_inventory':
                            return (
                              <TableCell key={colId} className="align-middle" style={st}>
                                <Button
                                  type="button"
                                  variant="link"
                                  className="h-auto p-0 text-sm font-semibold text-[#101828]"
                                  onClick={() => handleOpenInventorySummaryDetails(item)}
                                >
                                  {totalInventoryQty} {summaryUnit}
                                </Button>
                              </TableCell>
                            );
                          case 'reserved':
                            return (
                              <TableCell key={colId} className="align-middle" style={st}>
                                {reservedQty > 0 ? (
                                  <Button
                                    type="button"
                                    variant="link"
                                    className="h-auto p-0 text-sm font-semibold text-[#101828]"
                                    onClick={() => handleOpenAllocationDetails(item)}
                                  >
                                    {reservedQty} {summaryUnit}
                                  </Button>
                                ) : (
                                  <span className="text-sm text-[#6a7282]">0 {summaryUnit}</span>
                                )}
                              </TableCell>
                            );
                          case 'available':
                            return (
                              <TableCell key={colId} className="align-middle" style={st}>
                                <span className="text-sm text-[#0a0a0a]">
                                  {netQty} {summaryUnit}
                                </span>
                              </TableCell>
                            );
                          case 'status':
                            return (
                              <TableCell key={colId} className="align-middle" style={st}>
                                {statusBadge}
                              </TableCell>
                            );
                          case 'actions':
                            return (
                              <TableCell key={colId} className="text-right align-middle" style={st}>
                                <div className="flex flex-wrap justify-end gap-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => onViewDetails?.(item)}
                                    className="flex items-center gap-1"
                                  >
                                    <Eye className="h-3 w-3" />
                                    View
                                  </Button>

                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setSelectedInventoryForLogs(item);
                                      setLogsModalOpen(true);
                                    }}
                                    className="flex items-center gap-1"
                                    title="View item addition logs"
                                  >
                                    <History className="h-3 w-3" />
                                    Logs{' '}
                                    {(item as any).consolidatedIds?.length > 1 &&
                                      `(${(item as any).consolidatedIds.length})`}
                                  </Button>

                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="flex items-center gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => {
                                      setDeleteTarget(item);
                                      setDeleteOpen(true);
                                    }}
                                    title="Remove this stock line"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    Delete
                                  </Button>
                                </div>
                              </TableCell>
                            );
                          default:
                            return null;
                        }
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {filteredInventory.length === 0 && (
              <div className="border-t border-[#e5e7eb] px-4 py-12 text-center">
                <Archive className="mx-auto mb-4 h-12 w-12 text-[#6a7282]" />
                <p className="text-sm text-[#6a7282]">No items found in storage zone</p>
              </div>
            )}
          </div>

            {/* Inventory Logs Modal */}
            {selectedInventoryForLogs && (
              <InventoryLogsModal
                open={logsModalOpen}
                onOpenChange={setLogsModalOpen}
                inventoryId={selectedInventoryForLogs.id}
                itemName={selectedInventoryForLogs.item_name}
                consolidatedIds={(selectedInventoryForLogs as any).consolidatedIds}
              />
            )}

            <DeleteWarehouseInventoryDialog
              open={deleteOpen}
              onOpenChange={(o) => {
                setDeleteOpen(o);
                if (!o) setDeleteTarget(null);
              }}
              item={deleteTarget as any}
              onDeleted={() => loadInventory()}
            />
            {selectedAllocationDetails && (
              <Dialog
                open={allocationModalOpen}
                onOpenChange={(open) => {
                  setAllocationModalOpen(open);
                  if (!open) {
                    setSelectedAllocationDetails(null);
                  }
                }}
              >
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Allocated Stock Details</DialogTitle>
                    <DialogDescription>
                      {selectedAllocationDetails.inventory.item_name} — {selectedAllocationDetails.inventory.bin?.bin_code}
                    </DialogDescription>
                  </DialogHeader>
                  {selectedAllocationDetails.details.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No allocations recorded for this item.</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedAllocationDetails.details.map((detail) => (
                        <div key={detail.allocationId} className="border rounded-lg p-3">
                          <div className="flex justify-between text-sm font-semibold">
                            <span>BOM #{detail.bomNumber}</span>
                            <span>{detail.quantity} {detail.unit}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Order #{detail.orderNumber}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Item: {detail.itemName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Allocated at: {new Date(detail.allocatedAt).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            )}
            {selectedSummaryDetails && (
              <Dialog
                open={summaryModalOpen}
                onOpenChange={(open) => {
                  setSummaryModalOpen(open);
                  if (!open) {
                    setSelectedSummaryDetails(null);
                  }
                }}
              >
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Bin-wise Inventory</DialogTitle>
                    <DialogDescription>
                      {selectedSummaryDetails.inventory.item_name}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    {selectedSummaryDetails.summary.bins.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No bin-wise details found.</p>
                    ) : (
                      <>
                        {selectedSummaryDetails.summary.bins.map((bin) => (
                          <div key={bin.binId} className="rounded-lg border p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-[#101828]">{bin.binCode}</p>
                              <p className="text-xs text-muted-foreground">{bin.location}</p>
                            </div>
                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                              <div className="text-xs text-muted-foreground">
                                Total Inventory: <span className="font-medium text-[#101828]">{bin.totalQuantity} {bin.unit}</span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Reserved: <span className="font-medium text-[#101828]">{bin.reservedQuantity} {bin.unit}</span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Available: <span className="font-medium text-[#101828]">{bin.availableQuantity} {bin.unit}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="rounded-lg border border-black/10 bg-[#f9fafb] p-3">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <div className="text-xs text-muted-foreground">
                              Total Inventory:{' '}
                              <span className="font-semibold text-[#101828]">
                                {selectedSummaryDetails.summary.totalQuantity} {selectedSummaryDetails.summary.unit}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Reserved:{' '}
                              <span className="font-semibold text-[#101828]">
                                {selectedSummaryDetails.summary.reservedQuantity} {selectedSummaryDetails.summary.unit}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Available:{' '}
                              <span className="font-semibold text-[#101828]">
                                {selectedSummaryDetails.summary.availableQuantity} {selectedSummaryDetails.summary.unit}
                              </span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            )}
            <Dialog open={columnsPickerOpen} onOpenChange={setColumnsPickerOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Table columns</DialogTitle>
                  <DialogDescription>
                    Choose which columns to show. Drag the edge of a column header to change width. Your choices are
                    saved in this browser.
                  </DialogDescription>
                </DialogHeader>
                <div className="max-h-[min(400px,60vh)] space-y-3 overflow-y-auto pr-1">
                  {STORAGE_INVENTORY_COLUMNS.map((c) => (
                    <div key={c.id} className="flex items-center gap-3">
                      <Checkbox
                        id={`inv-col-${c.id}`}
                        checked={columnVisibility[c.id]}
                        disabled={!!c.required}
                        onCheckedChange={(v) => setColumnShown(c.id, v === true)}
                      />
                      <Label
                        htmlFor={`inv-col-${c.id}`}
                        className={cn('flex-1 cursor-pointer text-sm font-normal leading-snug', c.required && 'text-muted-foreground')}
                      >
                        {c.label}
                        {c.required ? ' (always shown)' : ''}
                      </Label>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2 border-t border-[#e5e7eb] pt-4">
                  <Button type="button" variant="outline" onClick={resetTableLayout}>
                    Reset layout
                  </Button>
                  <Button type="button" onClick={() => setColumnsPickerOpen(false)}>
                    Done
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={!!filterDialogColumn} onOpenChange={(open) => !open && setFilterDialogColumn(null)}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Filter column</DialogTitle>
                </DialogHeader>
                {filterDialogColumn && (
                  <div className="space-y-3">
                    <Input
                      autoFocus
                      placeholder="Type to filter..."
                      value={columnFilters[filterDialogColumn]}
                      onChange={(event) =>
                        setColumnFilters((prev) => ({
                          ...prev,
                          [filterDialogColumn]: event.target.value,
                        }))
                      }
                    />
                    <div className="flex justify-between">
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setColumnFilters((prev) => ({
                            ...prev,
                            [filterDialogColumn]: '',
                          }))
                        }
                      >
                        Clear
                      </Button>
                      <Button onClick={() => setFilterDialogColumn(null)}>Done</Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
      </div>
    </div>
  );
};


