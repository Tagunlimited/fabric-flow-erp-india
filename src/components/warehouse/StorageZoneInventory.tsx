import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Archive, Package, Search, Eye, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { WarehouseInventory, BinInventorySummary, INVENTORY_STATUS_CONFIGS, ITEM_TYPE_CONFIGS } from '@/types/warehouse-inventory';
import { toast } from 'sonner';

interface StorageZoneInventoryProps {
  onViewDetails?: (inventory: WarehouseInventory) => void;
}

export const StorageZoneInventory: React.FC<StorageZoneInventoryProps> = ({ onViewDetails }) => {
  const [inventory, setInventory] = useState<WarehouseInventory[]>([]);
  const [binSummaries, setBinSummaries] = useState<BinInventorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [itemTypeFilter, setItemTypeFilter] = useState<string>('all');

  const loadInventory = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
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
        .eq('status', 'IN_STORAGE' as any)
        .order('moved_to_storage_date', { ascending: false });

      if (error) throw error;
      const filtered = ((data as any) || []).filter((i: any) => i?.bin?.location_type === 'STORAGE');
      setInventory(filtered);

      const summaries = createBinSummaries(filtered);
      setBinSummaries(summaries);
    } catch (error) {
      console.error('Error loading storage inventory:', error);
      toast.error('Failed to load storage zone inventory');
    } finally {
      setLoading(false);
    }
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

    return () => {
      window.removeEventListener('warehouse-inventory-updated', handler as any);
      try { supabase.removeChannel(channel); } catch {}
    };
  }, []);

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
                <SelectItem value="PRODUCT">Product</SelectItem>
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
                  <TableHead>Item Details</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Bin Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Moved To Storage</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInventory.map((item) => {
                  const statusConfig = getStatusConfig(item.status);
                  const itemTypeConfig = getItemTypeConfig(item.item_type);
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        {item.grn_item?.item_image_url ? (
                          <img
                            src={item.grn_item.item_image_url}
                            alt={item.item_name}
                            className="w-12 h-12 object-cover rounded border"
                            onError={(e) => { 
                              // Show placeholder if image fails to load
                              (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yNCAzNkMzMC42Mjc0IDM2IDM2IDMwLjYyNzQgMzYgMjRDMzYgMTcuMzcyNiAzMC42Mjc0IDEyIDI0IDEyQzE3LjM3MjYgMTIgMTIgMTcuMzcyNiAxMiAyNEMxMiAzMC42Mjc0IDE3LjM3MjYgMzYgMjQgMzZaIiBmaWxsPSIjOUNBM0FGIi8+CjxwYXRoIGQ9Ik0yNCAyOEMyNi4yMDkxIDI4IDI4IDI2LjIwOTEgMjggMjRDMjggMjEuNzkwOSAyNi4yMDkxIDIwIDI0IDIwQzIxLjc5MDkgMjAgMjAgMjEuNzkwOSAyMCAyNEMyMCAyNi4yMDkxIDIxLjc5MDkgMjggMjQgMjhaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4K';
                            }}
                          />
                        ) : (
                          <div className="w-12 h-12 bg-gray-100 rounded border flex items-center justify-center">
                            <Package className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.item_name}</p>
                          {/* <p className="text-sm text-muted-foreground">{item.item_code}</p> */}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${itemTypeConfig.bgColor} ${itemTypeConfig.color}`}>
                          {itemTypeConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{item.grn_item?.item_color || item.grn_item?.fabric_color || '-'}</span>
                          {(item.grn_item?.item_color || item.grn_item?.fabric_color) && (
                            <div 
                              className="w-4 h-4 rounded-full border border-gray-300"
                              style={{ backgroundColor: (item.grn_item?.item_color || item.grn_item?.fabric_color || '').toLowerCase() }}
                              title={item.grn_item?.item_color || item.grn_item?.fabric_color || ''}
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{item.quantity} {item.unit}</div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.bin?.bin_code}</p>
                          <p className="text-sm text-muted-foreground">
                            {item.bin?.rack?.floor?.warehouse?.name} &gt; 
                            Floor {item.bin?.rack?.floor?.floor_number} &gt; 
                            {item.bin?.rack?.rack_code}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${statusConfig.bgColor} ${statusConfig.color}`}>
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{item.moved_to_storage_date ? new Date(item.moved_to_storage_date).toLocaleString() : '-'}</p>
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
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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


