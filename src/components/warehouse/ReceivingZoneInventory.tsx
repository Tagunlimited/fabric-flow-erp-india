import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Package, 
  Archive, 
  Truck, 
  Search, 
  Filter,
  ArrowRight,
  Eye,
  Move,
  History
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { WarehouseInventory, BinInventorySummary, INVENTORY_STATUS_CONFIGS, ITEM_TYPE_CONFIGS } from '@/types/warehouse-inventory';
import { toast } from 'sonner';
import { InventoryLogsModal } from './InventoryLogsModal';

interface ReceivingZoneInventoryProps {
  onTransferItem?: (inventory: WarehouseInventory) => void;
  onViewDetails?: (inventory: WarehouseInventory) => void;
  itemType?: 'FABRIC' | 'ITEM' | 'PRODUCT'; // Optional filter for item type
}

export const ReceivingZoneInventory: React.FC<ReceivingZoneInventoryProps> = ({
  onTransferItem,
  onViewDetails,
  itemType
}) => {
  const [inventory, setInventory] = useState<WarehouseInventory[]>([]);
  const [binSummaries, setBinSummaries] = useState<BinInventorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [itemTypeFilter, setItemTypeFilter] = useState<string>('all');
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [selectedInventoryForLogs, setSelectedInventoryForLogs] = useState<WarehouseInventory | null>(null);

  // Load receiving zone inventory
  const loadInventory = async () => {
    try {
      setLoading(true);
      
      // Get all inventory in receiving zone bins
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
        .eq('status', 'RECEIVED' as any);
      
      // Filter by item_type if provided
      if (itemType) {
        query = query.eq('item_type', itemType);
      }
      
      const { data, error } = await query
        .order('received_date', { ascending: false })
        .order('bin_id', { ascending: true });

      if (error) throw error;
      
      // Debug: Log raw data from DB
      console.log('🔍 [ReceivingZone] Raw data from DB:', data?.length || 0);
      
      // Filter client-side for receiving zone bins to avoid join filter issues
      const filtered = ((data as any) || []).filter((i: any) => {
        const isReceiving = i?.bin?.location_type === 'RECEIVING_ZONE';
        if (!isReceiving && itemType === 'PRODUCT') {
          console.warn('⚠️ [ReceivingZone] Excluded non-receiving bin:', i.bin?.bin_code, 'location_type:', i.bin?.location_type);
        }
        return isReceiving;
      });
      
      // Debug: Log after bin filter
      console.log('🔍 [ReceivingZone] After bin filter:', filtered.length);
      
      // Fetch product_master data separately if item_type is PRODUCT
      let productMap = new Map<string, any>();
      if (itemType === 'PRODUCT') {
        const itemIds = filtered
          .map((i: any) => i.item_id)
          .filter((id: any) => id) as string[];
        
        if (itemIds.length > 0) {
          const { data: productsData, error: productsError } = await supabase
            .from('product_master')
            .select('id, sku, class, size, name, brand, category, main_image, image_url, image1, image2, images')
            .in('id', itemIds);
          
          if (!productsError && productsData) {
            productsData.forEach((product: any) => {
              productMap.set(product.id, product);
            });
          }
        }
      }
      
      // Merge product data into inventory items
      const inventoryWithProducts = filtered.map((item: any) => {
        if (itemType === 'PRODUCT' && item.item_id && productMap.has(item.item_id)) {
          return {
            ...item,
            product: productMap.get(item.item_id)
          };
        }
        return item;
      });
      
      // Debug: Log after product merge
      console.log('🔍 [ReceivingZone] After product merge:', inventoryWithProducts.length);
      
      // Debug: Group inventory by item_id for PRODUCT type to verify all bins
      if (itemType === 'PRODUCT') {
        const groupedByItemId = inventoryWithProducts.reduce((acc: any, item: any) => {
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
        console.log('📦 [ReceivingZone] Inventory grouped by item_id:', groupedByItemId);
      }
      
      // For PRODUCT type, don't consolidate - show separate rows for each bin
      // For other types, consolidate as before
      let processedInventory;
      if (itemType === 'PRODUCT') {
        // Don't consolidate - show all rows separately
        processedInventory = inventoryWithProducts as WarehouseInventory[];
      } else {
        // Consolidate duplicate items before displaying
        processedInventory = consolidateInventory(inventoryWithProducts as WarehouseInventory[]);
      }
      
      // Debug: Log final processed inventory
      console.log('🔍 [ReceivingZone] Final inventory:', processedInventory.length);
      
      setInventory(processedInventory);
      
      // Create bin summaries
      const summaries = createBinSummaries(processedInventory);
      setBinSummaries(summaries);
      
    } catch (error) {
      console.error('Error loading inventory:', error);
      toast.error('Failed to load receiving zone inventory');
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
        
        // Keep the most recent received_date
        if (item.received_date && existing.received_date) {
          const existingDate = new Date(existing.received_date);
          const newDate = new Date(item.received_date);
          if (newDate > existingDate) {
            existing.received_date = item.received_date;
          }
        } else if (item.received_date) {
          existing.received_date = item.received_date;
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

  // Create bin summaries from inventory data
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

  // Filter inventory based on search and filters
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
    // Live updates: listen to realtime changes for receiving items
    const channel = supabase
      .channel('receiving_inventory_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_inventory' } as any, () => {
        loadInventory();
      })
      .subscribe();

    return () => {
      window.removeEventListener('warehouse-inventory-updated', handler as any);
      try { supabase.removeChannel(channel); } catch {}
    };
  }, []);

  const getStatusConfig = (status: string) => {
    return INVENTORY_STATUS_CONFIGS[status as keyof typeof INVENTORY_STATUS_CONFIGS] || INVENTORY_STATUS_CONFIGS.RECEIVED;
  };

  const getItemTypeConfig = (itemType: string) => {
    return ITEM_TYPE_CONFIGS[itemType as keyof typeof ITEM_TYPE_CONFIGS] || ITEM_TYPE_CONFIGS.ITEM;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading receiving zone inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-600" />
            Receiving Zone Inventory
          </h2>
          <p className="text-muted-foreground">
            GRN items received and ready for transfer to storage
          </p>
        </div>
        <Button onClick={loadInventory} variant="outline">
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-600" />
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
              <Archive className="h-4 w-4 text-green-600" />
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
              <Truck className="h-4 w-4 text-orange-600" />
              <div>
                <p className="text-sm font-medium">Ready to Transfer</p>
                <p className="text-2xl font-bold">
                  {inventory.filter(item => item.status === 'RECEIVED').length}
                </p>
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
                <p className="text-2xl font-bold">
                  {Math.round(inventory.reduce((sum, item) => sum + item.quantity, 0))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
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
                <SelectItem value="RECEIVED">Received</SelectItem>
                <SelectItem value="IN_STORAGE">In Storage</SelectItem>
                <SelectItem value="READY_TO_DISPATCH">Ready to Dispatch</SelectItem>
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
                <SelectItem value="PRODUCT">Product</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
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
                  <TableHead>SKU</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Bin & Inventory</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInventory.map((item) => {
                  const statusConfig = getStatusConfig(item.status);
                  const itemTypeConfig = getItemTypeConfig(item.item_type);
                  
                  // Get product details from product_master if available
                  const product = (item as any).product;
                  const productImage = product?.main_image || product?.image_url || product?.image1 || item.grn_item?.item_image_url;
                  const productSku = product?.sku || item.item_code;
                  const productClass = product?.class || '-';
                  const productSize = product?.size || '-';
                  const productName = product?.name || item.item_name;
                  const productBrand = product?.brand || '-';
                  const productCategory = product?.category || '-';
                  
                  return (
                    <TableRow key={`${item.id}-${item.bin_id}`}>
                      <TableCell>
                        {productImage ? (
                          <img
                            src={productImage}
                            alt={productName}
                            className="w-16 h-16 object-cover rounded border"
                            onError={(e) => { 
                              // Show placeholder if image fails to load
                              (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yNCAzNkMzMC42Mjc0IDM2IDM2IDMwLjYyNzQgMzYgMjRDMzYgMTcuMzcyNiAzMC42Mjc0IDEyIDI0IDEyQzE3LjM3MjYgMTIgMTIgMTcuMzcyNiAxMiAyNEMxMiAzMC42Mjc0IDE3LjM3MjYgMzYgMjQgMzZaIiBmaWxsPSIjOUNBM0FGIi8+CjxwYXRoIGQ9Ik0yNCAyOEMyNi4yMDkxIDI4IDI4IDI2LjIwOTEgMjggMjRDMjggMjEuNzkwOSAyNi4yMDkxIDIwIDI0IDIwQzIxLjc5MDkgMjAgMjAgMjEuNzkwOSAyMCAyNEMyMCAyNi4yMDkxIDIxLjc5MDkgMjggMjQgMjhaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4K';
                            }}
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-100 rounded border flex items-center justify-center">
                            <Package className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono font-medium text-sm">{productSku || '-'}</span>
                      </TableCell>
                      <TableCell>
                        {productClass && productClass !== '-' ? (
                          <Badge variant="secondary">{productClass}</Badge>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {productSize && productSize !== '-' ? (
                          <Badge variant="outline">{productSize}</Badge>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{productName || '-'}</div>
                      </TableCell>
                      <TableCell>
                        {productBrand && productBrand !== '-' ? productBrand : '-'}
                      </TableCell>
                      <TableCell>
                        {productCategory && productCategory !== '-' ? (
                          <Badge variant="outline">{productCategory}</Badge>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-sm">{item.bin?.bin_code}</p>
                            <Badge variant="outline" className="text-xs">
                              {item.quantity} {item.unit}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {item.bin?.rack?.floor?.warehouse?.name} &gt; 
                            Floor {item.bin?.rack?.floor?.floor_number} &gt; 
                            {item.bin?.rack?.rack_code}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {item.status === 'RECEIVED' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onTransferItem?.(item)}
                              className="flex items-center gap-1"
                            >
                              <Move className="h-3 w-3" />
                              Transfer
                            </Button>
                          )}
                          
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
            
            {filteredInventory.length === 0 && (
              <div className="text-center py-8">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No items found in receiving zone</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
