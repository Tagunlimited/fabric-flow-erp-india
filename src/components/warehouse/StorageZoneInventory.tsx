import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Archive, Package, Search, Eye, Filter, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { WarehouseInventory, BinInventorySummary, INVENTORY_STATUS_CONFIGS, ITEM_TYPE_CONFIGS } from '@/types/warehouse-inventory';
import { toast } from 'sonner';
import { InventoryLogsModal } from './InventoryLogsModal';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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

export const StorageZoneInventory: React.FC<StorageZoneInventoryProps> = ({ onViewDetails, itemType }) => {
  const [inventory, setInventory] = useState<WarehouseInventory[]>([]);
  const [binSummaries, setBinSummaries] = useState<BinInventorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [itemTypeFilter, setItemTypeFilter] = useState<string>('all');
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [selectedInventoryForLogs, setSelectedInventoryForLogs] = useState<WarehouseInventory | null>(null);
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);
  const [selectedAllocationDetails, setSelectedAllocationDetails] = useState<{
    inventory: WarehouseInventory;
    details: AllocationDetail[];
  } | null>(null);

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
        .eq('status', 'IN_STORAGE' as any);
      
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
        const isStorage = i?.bin?.location_type === 'STORAGE';
        if (!isStorage && itemType === 'PRODUCT') {
          console.warn('⚠️ [StorageZone] Excluded non-storage bin:', i.bin?.bin_code, 'location_type:', i.bin?.location_type);
        }
        return isStorage;
      });
      
      // Debug: Log after bin filter
      console.log('🔍 [StorageZone] After bin filter:', filtered.length);
      
      // Fetch item_master and fabric_master data for FABRIC and ITEM types
      const fabricIds = filtered
        .filter((i: any) => i.item_type === 'FABRIC' && i.item_id)
        .map((i: any) => i.item_id) as string[];
      
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
          .select('id, fabric_code, fabric_name, color, type, gsm, image')
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
      
      // For fabrics without item_id or where ID lookup failed, try to match by fabric name
      const fabricItemsWithoutMatch = filtered.filter((i: any) => 
        i.item_type === 'FABRIC' && (!i.item_id || !fabricMap.has(i.item_id))
      );
      
      if (fabricItemsWithoutMatch.length > 0) {
        // Get unique fabric names from items without matches
        const fabricNames = Array.from(new Set(
          fabricItemsWithoutMatch
            .map((i: any) => i.grn_item?.fabric_name || i.item_name)
            .filter(Boolean)
        )) as string[];
        
        if (fabricNames.length > 0) {
          const { data: fabricsByNameData, error: fabricsByNameError } = await supabase
            .from('fabric_master')
            .select('id, fabric_code, fabric_name, color, type, gsm, image')
            .in('fabric_name', fabricNames);
          
          if (!fabricsByNameError && fabricsByNameData) {
            // Create a map by fabric_name for easy lookup
            const fabricByNameMap = new Map<string, any>();
            fabricsByNameData.forEach((fabric: any) => {
              fabricByNameMap.set(fabric.fabric_name.toLowerCase(), fabric);
            });
            
            // Match fabrics by name and add to fabricMap
            fabricItemsWithoutMatch.forEach((item: any) => {
              const fabricName = (item.grn_item?.fabric_name || item.item_name || '').toLowerCase();
              if (fabricByNameMap.has(fabricName)) {
                const fabric = fabricByNameMap.get(fabricName);
                // Store by item_id if available, or by a generated key
                const key = item.item_id || `name_${fabricName}`;
                fabricMap.set(key, fabric);
                // Also update item.item_id if it was null
                if (!item.item_id) {
                  item.item_id = fabric.id;
                }
              }
            });
            console.log('✅ [StorageZone] Matched fabrics by name:', fabricsByNameData.length);
          }
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
          // Try to find fabric by item_id first
          if (item.item_id && fabricMap.has(item.item_id)) {
            return {
              ...item,
              fabric_master: fabricMap.get(item.item_id)
            };
          }
          // If not found by ID, try to match by name
          const fabricName = (item.grn_item?.fabric_name || item.item_name || '').toLowerCase();
          const nameKey = `name_${fabricName}`;
          if (fabricMap.has(nameKey)) {
            return {
              ...item,
              fabric_master: fabricMap.get(nameKey)
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
      const key = item.item_id 
        ? `${item.item_id}|${item.bin_id}|${item.status}|${item.unit}|${itemColor}`
        : `${item.item_code}|${item.item_name}|${item.bin_id}|${item.status}|${item.unit}|${itemColor}`;

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

  const filteredInventory = inventory.filter(item => {
    const matchesSearch = searchTerm === '' || 
      item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.item_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.bin?.bin_code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchesItemType = itemTypeFilter === 'all' || item.item_type === itemTypeFilter;
    return matchesSearch && matchesStatus && matchesItemType;
  });

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

  const getStatusConfig = (status: string) => {
    return INVENTORY_STATUS_CONFIGS[status as keyof typeof INVENTORY_STATUS_CONFIGS] || INVENTORY_STATUS_CONFIGS.IN_STORAGE;
  };

  const getItemTypeConfig = (itemType: string) => {
    return ITEM_TYPE_CONFIGS[itemType as keyof typeof ITEM_TYPE_CONFIGS] || ITEM_TYPE_CONFIGS.ITEM;
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Archive className="h-6 w-6 text-green-600" />
            Storage Zone Inventory
          </h2>
          <p className="text-muted-foreground">
            Items currently stored in warehouse storage bins
          </p>
        </div>
        <Button onClick={loadInventory} variant="outline">
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Archive className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-sm font-medium">Total Items</p>
                <p className="text-2xl font-bold">{inventory.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-sm font-medium">Bins Used</p>
                <p className="text-2xl font-bold">{binSummaries.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-purple-600" />
              <div>
                <p className="text-sm font-medium">Total Quantity</p>
                <p className="text-2xl font-bold">{Math.round(inventory.reduce((sum, item) => sum + item.quantity, 0))}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by item name, code, or bin..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filter by status" />
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
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="FABRIC">Fabric</SelectItem>
                <SelectItem value="ITEM">Item</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inventory Items ({filteredInventory.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Image</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Material/GSM</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Bin & Inventory</TableHead>
                  <TableHead>Allocated</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInventory.map((item) => {
                  const statusConfig = getStatusConfig(item.status);
                  const itemTypeConfig = getItemTypeConfig(item.item_type);
                  
                  // Get master data based on item type
                  const fabricMaster = (item as any).fabric_master;
                  const itemMaster = (item as any).item_master;
                  const product = (item as any).product;
                  
                  // Determine display values based on item type
                  let displayImage: string | undefined;
                  let displayCode: string;
                  let displayName: string;
                  let displayType: string;
                  let displayColor: string;
                  let displayMaterialGsm: string;
                  let displayBrand: string;
                  let displaySize: string;
                  
                  if (item.item_type === 'FABRIC' && fabricMaster) {
                    displayImage = fabricMaster.image || item.grn_item?.item_image_url;
                    // Always use fabric_code from fabric_master, never fallback to item_code which might be URL
                    displayCode = fabricMaster.fabric_code || '-';
                    displayName = fabricMaster.fabric_name || item.item_name;
                    displayType = 'Fabric'; // Always show "Fabric" for fabric items
                    displayColor = item.grn_item?.fabric_color || fabricMaster.color || '-';
                    // Combine material (type) and GSM: e.g., "Cotton 240 GSM"
                    const material = fabricMaster.type || '';
                    const gsm = fabricMaster.gsm || '';
                    displayMaterialGsm = material && gsm ? `${material} ${gsm} GSM` : material || gsm || '-';
                    displayBrand = '-';
                    displaySize = '-';
                  } else if (item.item_type === 'ITEM' && itemMaster) {
                    displayImage = itemMaster.image || item.grn_item?.item_image_url;
                    // Always use item_code from item_master
                    displayCode = itemMaster.item_code || '-';
                    displayName = itemMaster.item_name || item.item_name;
                    displayType = itemMaster.item_type || '-';
                    displayColor = item.grn_item?.item_color || itemMaster.color || '-';
                    displayMaterialGsm = itemMaster.material || '-';
                    displayBrand = itemMaster.brand || '-';
                    displaySize = itemMaster.size || '-';
                  } else if (item.item_type === 'PRODUCT' && product) {
                    displayImage = product.main_image || product.image_url || product.image1 || item.grn_item?.item_image_url;
                    displayCode = product.sku || '-';
                    displayName = product.name || item.item_name;
                    displayType = product.class || '-';
                    displayColor = '-';
                    displayMaterialGsm = '-';
                    displayBrand = product.brand || '-';
                    displaySize = product.size || '-';
                  } else {
                    // Fallback to GRN item data - but check if item_code looks like a URL
                    displayImage = item.grn_item?.item_image_url;
                    // If item_code looks like a URL, don't use it
                    const itemCode = item.item_code || '';
                    displayCode = (itemCode.startsWith('http://') || itemCode.startsWith('https://')) ? '-' : itemCode;
                    displayName = item.item_name;
                    // For fabric items, show "Fabric" in Type column
                    displayType = item.item_type === 'FABRIC' ? 'Fabric' : item.item_type || '-';
                    displayColor = item.grn_item?.fabric_color || item.grn_item?.item_color || '-';
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

                  return (
                    <TableRow key={`${item.id}-${item.bin_id}`}>
                      <TableCell>
                        {displayImage ? (
                          <img
                            src={displayImage}
                            alt={displayName}
                            className="w-16 h-16 object-cover rounded border"
                            onError={(e) => { 
                              // Replace image with NA when it fails to load
                              const img = e.currentTarget as HTMLImageElement;
                              img.style.display = 'none';
                              const naDiv = document.createElement('div');
                              naDiv.className = 'w-16 h-16 flex items-center justify-center bg-muted rounded border text-xs text-muted-foreground font-medium';
                              naDiv.textContent = 'NA';
                              img.parentElement?.appendChild(naDiv);
                            }}
                          />
                        ) : (
                          <div className="w-16 h-16 flex items-center justify-center bg-muted rounded border text-xs text-muted-foreground font-medium">
                            NA
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono font-medium text-sm">{displayCode || '-'}</span>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{displayName || '-'}</div>
                      </TableCell>
                      <TableCell>
                        {displayType && displayType !== '-' ? (
                          <Badge variant="secondary">{displayType}</Badge>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{displayColor !== '-' ? displayColor : '-'}</span>
                          {displayColor !== '-' && (
                            <div 
                              className="w-4 h-4 rounded-full border border-gray-300"
                              style={{ backgroundColor: displayColor.toLowerCase() }}
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {displayMaterialGsm !== '-' ? displayMaterialGsm : '-'}
                      </TableCell>
                      <TableCell>
                        {displayBrand !== '-' ? displayBrand : '-'}
                      </TableCell>
                      <TableCell>
                        {displaySize !== '-' ? (
                          <Badge variant="outline">{displaySize}</Badge>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-sm">{item.bin?.bin_code}</p>
                            <Badge variant="outline" className="text-xs">
                              Total {item.quantity} {item.unit}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Available: {availableQuantity} {item.unit}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Allocated: {allocatedQuantity} {item.unit}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.bin?.rack?.floor?.warehouse?.name} &gt; 
                            Floor {item.bin?.rack?.floor?.floor_number} &gt; 
                            {item.bin?.rack?.rack_code}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {allocatedQuantity > 0 ? (
                          <Button
                            variant="link"
                            className="p-0 h-auto"
                            onClick={() => handleOpenAllocationDetails(item)}
                          >
                            {allocatedQuantity} {item.unit}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">0 {item.unit}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onViewDetails?.(item)}
                            className="flex items-center gap-1"
                          >
                            <Eye className="h-3 w-3" />
                            View
                          </Button>
                          
                          <Button
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
                            Logs {(item as any).consolidatedIds?.length > 1 && `(${(item as any).consolidatedIds.length})`}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            
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
            {filteredInventory.length === 0 && (
              <div className="text-center py-8">
                <Archive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No items found in storage zone</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};


