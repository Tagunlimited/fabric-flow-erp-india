import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Package,
  Archive,
  Truck,
  BarChart3,
  Plus,
  Trash2,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ReceivingZoneInventory } from '@/components/warehouse/ReceivingZoneInventory';
import { StorageZoneInventory } from '@/components/warehouse/StorageZoneInventory';
import { InventoryTransferModal } from '@/components/warehouse/InventoryTransferModal';
import { AddRawInventoryModal } from '@/components/warehouse/AddRawInventoryModal';
import { DeleteWarehouseInventoryDialog } from '@/components/warehouse/DeleteWarehouseInventoryDialog';
import { WarehouseInventory } from '@/types/warehouse-inventory';
import { ErpLayout } from '@/components/ErpLayout';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { BackButton } from '@/components/common/BackButton';

const WarehouseInventoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedInventory, setSelectedInventory] = useState<WarehouseInventory | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [activeTab, setActiveTab] = useState('receiving');
  const [totals, setTotals] = useState({ receiving: 0, storage: 0, dispatch: 0, all: 0 });
  const [storageBinCount, setStorageBinCount] = useState(0);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [grnHeader, setGrnHeader] = useState<any | null>(null);
  const [poHeader, setPoHeader] = useState<any | null>(null);
  const [bomItems, setBomItems] = useState<any[]>([]);
  const [relatedOrders, setRelatedOrders] = useState<any[]>([]);
  const [addInventoryOpen, setAddInventoryOpen] = useState(false);
  const [detailsDeleteOpen, setDetailsDeleteOpen] = useState(false);

  const loadTotals = async () => {
    try {
      // First, check if warehouse_inventory table exists
      const { data: tableCheck, error: tableError } = await supabase
        .from('warehouse_inventory' as any)
        .select('id')
        .limit(1);
      
      if (tableError) {
        console.error('Warehouse inventory table error:', tableError);
        // Set default totals if table doesn't exist
        setTotals({ receiving: 0, storage: 0, dispatch: 0, all: 0 });
        setStorageBinCount(0);
        return;
      }

      // Fetch totals by status; filter location type client-side to avoid RLS join issues
      // Exclude PRODUCT items - only show FABRIC and ITEM
      const { data, error } = await supabase
        .from('warehouse_inventory' as any)
        .select(`
          quantity,
          status,
          item_type,
          bin_id,
          bin:bin_id (
            id,
            location_type
          )
        `)
        .in('item_type', ['FABRIC', 'ITEM'] as any);
      
      if (error) {
        console.error('Error fetching warehouse inventory totals:', error);
        setTotals({ receiving: 0, storage: 0, dispatch: 0, all: 0 });
        setStorageBinCount(0);
        return;
      }
      
      const rows = (data as any) || [];

      // Filter out PRODUCT items (only show FABRIC and ITEM)
      const filteredRows = rows.filter((r: any) => 
        r.item_type === 'FABRIC' || r.item_type === 'ITEM'
      );
      
      const receivingQty = filteredRows
        .filter((r: any) => r.status === 'RECEIVED' && r.bin?.location_type === 'RECEIVING_ZONE')
        .reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);
      const storageQty = filteredRows
        .filter((r: any) => r.status === 'IN_STORAGE' && r.bin?.location_type === 'STORAGE')
        .reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);
      const dispatchQty = filteredRows
        .filter((r: any) => r.status === 'READY_TO_DISPATCH' && r.bin?.location_type === 'DISPATCH_ZONE')
        .reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);
      const allQty = filteredRows.reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);

      const storageBins = new Set(
        filteredRows
          .filter(
            (r: any) =>
              r.status === 'IN_STORAGE' && r.bin?.location_type === 'STORAGE' && r.bin_id
          )
          .map((r: any) => r.bin_id as string)
      );
      setStorageBinCount(storageBins.size);

      setTotals({ receiving: receivingQty, storage: storageQty, dispatch: dispatchQty, all: allQty });
    } catch (error) {
      console.error('Error in loadTotals:', error);
      setTotals({ receiving: 0, storage: 0, dispatch: 0, all: 0 });
      setStorageBinCount(0);
    }
  };

  useEffect(() => {
    loadTotals();
    const handler = () => loadTotals();
    window.addEventListener('warehouse-inventory-updated', handler as any);
    // Realtime subscription to auto-refresh when warehouse_inventory changes
    const channel = supabase
      .channel('warehouse_inventory_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_inventory' } as any, () => {
        loadTotals();
        try { window.dispatchEvent(new CustomEvent('warehouse-inventory-updated')); } catch {}
      })
      .subscribe();

    return () => {
      window.removeEventListener('warehouse-inventory-updated', handler as any);
      try { supabase.removeChannel(channel); } catch {}
    };
  }, []);

  const loadRelatedDetails = async (inv: WarehouseInventory) => {
    try {
      setLoadingDetails(true);
      setGrnHeader(null);
      setPoHeader(null);
      setBomItems([]);
      setRelatedOrders([]);

      // 1. Fetch GRN Header (skip when manual / opening-balance row)
      let grnData: any = null;
      if (inv.grn_id) {
        const { data, error } = await supabase
          .from('grn_master' as any)
          .select(`id, grn_number, grn_date, received_date, status, po_id,
                   supplier_master:supplier_id (supplier_name, supplier_code),
                   purchase_orders:po_id (id, po_number, status, bom_id)`)
          .eq('id', inv.grn_id as any)
          .single();
        if (!error && data) {
          grnData = data;
        } else {
          const { data: alt } = await supabase
            .from('goods_receipt_notes' as any)
            .select(`id, grn_number, received_date, status, po_id`)
            .eq('id', inv.grn_id as any)
            .single();
          if (alt) grnData = alt;
        }
      }
      if (grnData) setGrnHeader(grnData);

      // 2. Fetch Purchase Order from GRN
      let poData = grnData?.purchase_orders || null;
      const poId = grnData?.po_id || grnData?.purchase_orders?.id;
      if (!poData && poId) {
        const { data } = await supabase
          .from('purchase_orders' as any)
          .select('id, po_number, status, total_amount, supplier_id, bom_id')
          .eq('id', poId as any)
          .single();
        if (data) poData = data;
      }
      if (poData) {
        setPoHeader(poData);

        // 3. Fetch BOM from PO
        if (poData.bom_id) {
          const { data: bomData } = await supabase
            .from('bom_records' as any)
            .select(`id, bom_number, product_name, status, order_id,
                     bom_record_items(*)`)
            .eq('id', poData.bom_id as any)
            .single();

          if (bomData) {
            const bomOrderId = (bomData as any).order_id;

            // 4. Fetch Order from BOM
            if (bomOrderId) {
              const { data: orderData } = await supabase
                .from('orders' as any)
                .select(`id, order_number, order_date, status, final_amount, customer_id,
                          customers:customer_id (company_name)`)
                .eq('id', bomOrderId as any)
                .single();

              if (orderData) {
                setRelatedOrders([orderData]);
              }
            }
          }
        }
      }

      // Match BOM items by item_id/item_code (also for manual warehouse rows without GRN/PO)
      if (inv.item_id || inv.item_code) {
        const bomItemQuery = supabase
          .from('bom_record_items' as any)
          .select(`id, bom_id, item_name, item_code, unit_of_measure, qty_per_product, qty_total,
                   bom_records:bom_id (id, bom_number, product_name, status, order_id)`);

        if (inv.item_id) {
          bomItemQuery.eq('item_id', inv.item_id as any);
        } else if (inv.item_code) {
          bomItemQuery.eq('item_code', inv.item_code as any);
        }

        const { data: bomItemsData } = await bomItemQuery.limit(25);

        if (bomItemsData && bomItemsData.length > 0) {
          setBomItems(bomItemsData as any[]);

          const uniqueOrderIds = Array.from(new Set(
            bomItemsData
              .map((bi: any) => bi.bom_records?.order_id)
              .filter(Boolean)
          ));

          if (uniqueOrderIds.length > 0) {
            const { data: ordersData } = await supabase
              .from('orders' as any)
              .select(`id, order_number, order_date, status, final_amount, customer_id,
                        customers:customer_id (company_name)`)
              .in('id', uniqueOrderIds)
              .limit(10);

            if (ordersData && ordersData.length > 0) {
              setRelatedOrders(ordersData as any[]);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading related details:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    if (showViewModal && selectedInventory) {
      loadRelatedDetails(selectedInventory);
    }
  }, [showViewModal, selectedInventory?.id]);

  const handleTransferItem = (inventory: WarehouseInventory) => {
    setSelectedInventory(inventory);
    setShowTransferModal(true);
  };

  const handleViewDetails = (inventory: WarehouseInventory) => {
    setSelectedInventory(inventory);
    setShowViewModal(true);
  };

  const handleTransferComplete = () => {
    // Refresh the inventory list
    setShowTransferModal(false);
    setSelectedInventory(null);
  };

  return (
    <ErpLayout>
      <div className="w-full space-y-6 bg-[#f9fafb] p-6 -mx-4 sm:-mx-6 rounded-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <BackButton to="/inventory" label="Back to Inventory" />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-[#6a7282]">
          <Link to="/inventory" className="hover:text-[#101828] transition-colors">
            Inventory
          </Link>
          <ChevronRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
          <span className="font-medium text-[#101828]">Raw Material Inventory</span>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2 max-w-3xl">
            <h1 className="text-[30px] font-bold leading-9 tracking-tight text-[#101828]">
              Raw Material Inventory
            </h1>
            <p className="text-base leading-6 text-[#4a5565]">
              Fabrics and items received through GRN—or added manually—across receiving and storage bins.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-2 rounded-lg border-black/10 bg-white text-[#0a0a0a] shadow-sm hover:bg-[#fafafa]"
              onClick={() => loadTotals()}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button
              type="button"
              className="h-9 gap-2 rounded-lg bg-[#030213] px-4 text-white hover:bg-[#030213]/90"
              onClick={() => setAddInventoryOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Add Inventory
            </Button>
          </div>
        </div>

      {/* Overview Cards — Figma: white + border-2 #e5e7eb, rounded 14px; total card purple gradient */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-[14px] border-2 border-[#e5e7eb] bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-[#dbeafe]">
              <Package className="h-6 w-6 text-blue-600" />
            </div>
            <span className="rounded-lg bg-[#dbeafe] px-2.5 py-1 text-xs font-medium text-[#1447e6]">
              Active
            </span>
          </div>
          <p className="mt-4 text-sm font-medium text-[#4a5565]">Receiving Zone</p>
          <p className="mt-1 text-[30px] font-bold leading-9 tracking-tight text-[#101828] tabular-nums">
            {Math.round(totals.receiving)}
          </p>
          <p className="mt-2 text-sm font-medium text-[#6a7282]">Qty in receiving bins</p>
        </div>

        <div className="rounded-[14px] border-2 border-[#e5e7eb] bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-[#dcfce7]">
              <Archive className="h-6 w-6 text-green-700" />
            </div>
            <span className="rounded-lg bg-[#dcfce7] px-2.5 py-1 text-xs font-medium text-[#008236]">
              {storageBinCount} {storageBinCount === 1 ? 'Bin' : 'Bins'}
            </span>
          </div>
          <p className="mt-4 text-sm font-medium text-[#4a5565]">Storage Zone</p>
          <p className="mt-1 text-[30px] font-bold leading-9 tracking-tight text-[#101828] tabular-nums">
            {Math.round(totals.storage)}
          </p>
          <p className="mt-2 text-sm font-medium text-[#6a7282]">Items in storage</p>
        </div>

        <div className="rounded-[14px] border-2 border-[#e5e7eb] bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-[#ffedd4]">
              <Truck className="h-6 w-6 text-[#ca3500]" />
            </div>
            <span className="rounded-lg bg-[#ffedd4] px-2.5 py-1 text-xs font-medium text-[#ca3500]">
              Ready
            </span>
          </div>
          <p className="mt-4 text-sm font-medium text-[#4a5565]">Dispatch Zone</p>
          <p className="mt-1 text-[30px] font-bold leading-9 tracking-tight text-[#101828] tabular-nums">
            {Math.round(totals.dispatch)}
          </p>
          <p className="mt-2 text-sm font-medium text-[#6a7282]">Ready to ship</p>
        </div>

        <div
          className="rounded-[14px] p-5 text-white sm:col-span-2 xl:col-span-1"
          style={{
            background: 'linear-gradient(153.435deg, rgb(173, 70, 255) 0%, rgb(152, 16, 250) 100%)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-white/20">
              <BarChart3 className="h-6 w-6 text-white" />
            </div>
          </div>
          <p className="mt-4 text-sm font-medium text-[#f3e8ff]">Total Raw Qty</p>
          <p className="mt-1 text-[30px] font-bold leading-9 tracking-tight tabular-nums">
            {Math.round(totals.all)}
          </p>
          <p className="mt-2 text-sm text-[#f3e8ff]">Fabrics + items (excl. products)</p>
        </div>
      </div>

      {/* Zone tabs — Figma filter-style neutral pills */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap items-center justify-start gap-1 rounded-lg bg-[#f3f3f5] p-1 text-[#0a0a0a] md:w-fit">
          <TabsTrigger
            value="receiving"
            className={cn(
              'gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all',
              'data-[state=active]:border data-[state=active]:border-black/10 data-[state=active]:bg-white data-[state=active]:shadow-sm',
              'data-[state=inactive]:bg-transparent data-[state=inactive]:shadow-none'
            )}
          >
            <Package className="h-4 w-4 shrink-0" />
            Receiving
          </TabsTrigger>
          <TabsTrigger
            value="storage"
            className={cn(
              'gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all',
              'data-[state=active]:border data-[state=active]:border-black/10 data-[state=active]:bg-white data-[state=active]:shadow-sm',
              'data-[state=inactive]:bg-transparent data-[state=inactive]:shadow-none'
            )}
          >
            <Archive className="h-4 w-4 shrink-0" />
            Storage
          </TabsTrigger>
          <TabsTrigger
            value="dispatch"
            className={cn(
              'gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all',
              'data-[state=active]:border data-[state=active]:border-black/10 data-[state=active]:bg-white data-[state=active]:shadow-sm',
              'data-[state=inactive]:bg-transparent data-[state=inactive]:shadow-none'
            )}
          >
            <Truck className="h-4 w-4 shrink-0" />
            Dispatch
          </TabsTrigger>
        </TabsList>

        <TabsContent value="receiving" className="space-y-4">
          <ReceivingZoneInventory
            onTransferItem={handleTransferItem}
            onViewDetails={handleViewDetails}
            itemType={undefined} // Don't filter by single type, but components will filter out PRODUCT
          />
        </TabsContent>

        <TabsContent value="storage" className="space-y-4">
          <StorageZoneInventory 
            onViewDetails={handleViewDetails}
            itemType={undefined} // Don't filter by single type, but components will filter out PRODUCT
          />
        </TabsContent>

        <TabsContent value="dispatch" className="space-y-4">
          <Card className="shadow-erp-md border-border/60 rounded-xl border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Truck className="h-5 w-5 text-muted-foreground" />
                Dispatch zone
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 px-4 rounded-lg bg-muted/20 border border-border/40">
                <Truck className="h-12 w-12 text-muted-foreground/70 mx-auto mb-4" />
                <p className="text-muted-foreground font-medium">Dispatch tracking is not wired here yet</p>
                <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                  Raw materials in the dispatch zone will be listed in a future update. Use receiving and storage tabs for active stock.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>

      <AddRawInventoryModal
        open={addInventoryOpen}
        onOpenChange={setAddInventoryOpen}
        onSuccess={() => loadTotals()}
      />

      {/* Transfer Modal */}
      <InventoryTransferModal
        open={showTransferModal}
        onOpenChange={setShowTransferModal}
        inventory={selectedInventory}
        onTransferComplete={handleTransferComplete}
      />

      {/* View Details */}
      {selectedInventory && (
        <Dialog
          open={showViewModal}
          onOpenChange={(open) => {
            setShowViewModal(open);
            if (!open) setDetailsDeleteOpen(false);
          }}
        >
          <DialogContent className="max-w-2xl w-[95vw] max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden sm:rounded-xl">
            <DialogHeader className="px-6 pt-6 pb-2 space-y-1 text-left">
              <DialogTitle className="text-xl">Inventory details</DialogTitle>
              {!selectedInventory.grn_id && (
                <p className="text-sm font-normal text-muted-foreground">
                  Not linked to a GRN — manual or opening balance line.
                </p>
              )}
            </DialogHeader>
            <ScrollArea className="flex-1 min-h-0 max-h-[min(520px,72vh)] px-6">
              <div className="space-y-4 pb-4">
              <div>
                <div className="text-sm text-muted-foreground">Item</div>
                <div className="font-medium">{selectedInventory.item_name}</div>
                <div className="text-xs text-muted-foreground">{selectedInventory.item_code}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Image</div>
                  {selectedInventory.grn_item?.item_image_url && (
                    <img
                      src={selectedInventory.grn_item.item_image_url}
                      alt={selectedInventory.item_name}
                      className="w-24 h-24 object-cover rounded border"
                    />
                  )}
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Type</div>
                  <div className="font-medium">{selectedInventory.item_type}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Quantity</div>
                  <div className="font-medium">{selectedInventory.quantity} {selectedInventory.unit}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Color</div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{selectedInventory.grn_item?.item_color || selectedInventory.grn_item?.fabric_color || '-'}</span>
                    {(selectedInventory.grn_item?.item_color || selectedInventory.grn_item?.fabric_color) && (
                      <div 
                        className="w-4 h-4 rounded-full border border-gray-300"
                        style={{ backgroundColor: (selectedInventory.grn_item?.item_color || selectedInventory.grn_item?.fabric_color || '').toLowerCase() }}
                      />
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Bin</div>
                  <div className="font-medium">{selectedInventory.bin?.bin_code}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Status</div>
                  <div className="font-medium">{selectedInventory.status}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Received</div>
                  <div className="font-medium">{new Date(selectedInventory.received_date).toLocaleString()}</div>
                </div>
                {selectedInventory.moved_to_storage_date && (
                  <div>
                    <div className="text-sm text-muted-foreground">Moved to Storage</div>
                    <div className="font-medium">{new Date(selectedInventory.moved_to_storage_date).toLocaleString()}</div>
                  </div>
                )}
                {selectedInventory.dispatched_date && (
                  <div>
                    <div className="text-sm text-muted-foreground">Dispatched</div>
                    <div className="font-medium">{new Date(selectedInventory.dispatched_date).toLocaleString()}</div>
                  </div>
                )}
              </div>
              {selectedInventory.notes && (
                <div>
                  <div className="text-sm text-muted-foreground">Notes</div>
                  <div className="text-sm">{selectedInventory.notes}</div>
                </div>
              )}

              <Separator />

              {/* GRN Item Attributes */}
              <div className="pt-1">
                <h3 className="font-semibold mb-2">GRN line details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Item/Fabric Name</div>
                    <div className="font-medium">{selectedInventory.grn_item?.item_name || selectedInventory.grn_item?.fabric_name || '-'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Unit of Measure</div>
                    <div className="font-medium">{selectedInventory.grn_item?.unit_of_measure || '-'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Received Quantity</div>
                    <div className="font-medium">{selectedInventory.grn_item?.received_quantity ?? '-'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Approved Quantity</div>
                    <div className="font-medium">{selectedInventory.grn_item?.approved_quantity ?? '-'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Rejected Quantity</div>
                    <div className="font-medium">{selectedInventory.grn_item?.rejected_quantity ?? '-'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">GSM (Fabric)</div>
                    <div className="font-medium">{selectedInventory.grn_item?.fabric_gsm || '-'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">GST Rate</div>
                    <div className="font-medium">{selectedInventory.grn_item?.gst_rate ?? '-'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">GST Amount</div>
                    <div className="font-medium">{selectedInventory.grn_item?.gst_amount ?? '-'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Line Total</div>
                    <div className="font-medium">{selectedInventory.grn_item?.line_total ?? '-'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Batch Number</div>
                    <div className="font-medium">{selectedInventory.grn_item?.batch_number || '-'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Expiry Date</div>
                    <div className="font-medium">{selectedInventory.grn_item?.expiry_date || '-'}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-muted-foreground">Condition Notes</div>
                    <div className="font-medium">{selectedInventory.grn_item?.condition_notes || '-'}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-muted-foreground">Inspection Notes</div>
                    <div className="font-medium">{selectedInventory.grn_item?.inspection_notes || '-'}</div>
                  </div>
                </div>
                {!selectedInventory.grn_item && (
                  <p className="text-sm text-muted-foreground mt-2">No GRN item snapshot on this row.</p>
                )}
              </div>

              <Separator />

              {/* Related Records */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Related Records</h3>
                  {/* Flow Diagram */}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>Order</span>
                    <span className="font-bold">→</span>
                    <span>BOM</span>
                    <span className="font-bold">→</span>
                    <span>PO</span>
                    <span className="font-bold">→</span>
                    <span>GRN</span>
                    <span className="font-bold">→</span>
                    <span>Inventory</span>
                  </div>
                </div>
                {loadingDetails && (
                  <div className="text-sm text-muted-foreground">Loading related records...</div>
                )}

                {/* GRN Header */}
                {grnHeader && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Goods Receipt Note</div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <div className="font-medium">{grnHeader.grn_number}</div>
                        <div className="text-muted-foreground">Status: {grnHeader.status}</div>
                        {grnHeader.received_date && (
                          <div className="text-muted-foreground">Received: {new Date(grnHeader.received_date).toLocaleDateString()}</div>
                        )}
                        {grnHeader.supplier_master?.supplier_name && (
                          <div className="text-muted-foreground">Supplier: {grnHeader.supplier_master.supplier_name}</div>
                        )}
                      </div>
                      <Button
                        variant="link"
                        className="h-auto p-0 text-primary"
                        onClick={() => navigate(`/procurement/grn/${grnHeader.id}`)}
                      >
                        View GRN
                      </Button>
                    </div>
                  </div>
                )}

                {/* Purchase Order */}
                {poHeader && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Purchase Order</div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <div className="font-medium">{poHeader.po_number}</div>
                        <div className="text-muted-foreground">Status: {poHeader.status}</div>
                        {poHeader.total_amount && (
                          <div className="text-muted-foreground">Total: ₹{poHeader.total_amount}</div>
                        )}
                      </div>
                      <Button
                        variant="link"
                        className="h-auto p-0 text-primary"
                        onClick={() => navigate(`/procurement/po/${poHeader.id}`)}
                      >
                        View PO
                      </Button>
                    </div>
                  </div>
                )}

                {/* Debug Info */}
                {process.env.NODE_ENV === 'development' && (
                  <div className="text-xs text-blue-600 p-2 bg-blue-50 border border-blue-200 rounded">
                    Debug: Looking for orders with item_id="{selectedInventory?.item_id}" or item_code="{selectedInventory?.item_code}". 
                    Found {relatedOrders.length} order(s).
                  </div>
                )}

                {/* Related Orders */}
                {relatedOrders && relatedOrders.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-sm">Original Customer Order</h4>
                      <Badge variant="default" className="bg-blue-600">
                        Active Order
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      {relatedOrders.map((order: any) => (
                        <div key={order.id} className="bg-white rounded p-3 border border-blue-100">
                          <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                            <div>
                              <div className="text-muted-foreground text-xs">Order Number</div>
                              <div className="font-medium">{order.order_number}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground text-xs">Status</div>
                              <Badge variant={order.status === 'completed' ? 'default' : 'secondary'}>
                                {order.status}
                              </Badge>
                            </div>
                            <div>
                              <div className="text-muted-foreground text-xs">Order Date</div>
                              <div className="font-medium">
                                {order.order_date ? new Date(order.order_date).toLocaleDateString() : '-'}
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground text-xs">Customer</div>
                              <div className="font-medium">{order.customers?.company_name || 'N/A'}</div>
                            </div>
                            {order.final_amount && (
                              <div className="col-span-2">
                                <div className="text-muted-foreground text-xs">Order Value</div>
                                <div className="font-bold text-blue-600">₹{order.final_amount}</div>
                              </div>
                            )}
                          </div>
                          <Button
                            className="w-full"
                            onClick={() => navigate(`/orders/${order.id}`)}
                          >
                            View order details
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* BOM Items */}
                {bomItems && bomItems.length > 0 && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Bills of Material</div>
                    <div className="text-xs text-muted-foreground mb-2">Showing up to 25 related BOM items</div>
                    <div className="border rounded">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left p-2">BOM</th>
                            <th className="text-left p-2">Item</th>
                            <th className="text-left p-2">Code</th>
                            <th className="text-right p-2">Qty/Prod</th>
                            <th className="text-right p-2">Total Qty</th>
                            <th className="text-left p-2">Status</th>
                            <th className="text-left p-2">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bomItems.map((bi: any) => (
                            <tr key={bi.id} className="border-t">
                              <td className="p-2">{bi.bom_records?.product_name || bi.bom_id}</td>
                              <td className="p-2">{bi.item_name}</td>
                              <td className="p-2">{bi.item_code}</td>
                              <td className="p-2 text-right">{bi.qty_per_product ?? '-'}</td>
                              <td className="p-2 text-right">{bi.qty_total ?? '-'}</td>
                              <td className="p-2">{bi.bom_records?.status || '-'}</td>
                              <td className="p-2">
                                {bi.bom_records?.id && (
                                  <Button
                                    variant="link"
                                    className="h-auto p-0 text-xs"
                                    onClick={() => navigate(`/bom/${bi.bom_records.id}`)}
                                  >
                                    View
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              </div>
            </ScrollArea>
            <div className="flex justify-end px-6 py-3 border-t border-border/60 bg-muted/20">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="gap-2"
                onClick={() => setDetailsDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete inventory
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <DeleteWarehouseInventoryDialog
        open={detailsDeleteOpen && !!selectedInventory}
        onOpenChange={(open) => {
          setDetailsDeleteOpen(open);
        }}
        item={selectedInventory as any}
        onDeleted={() => {
          setDetailsDeleteOpen(false);
          setShowViewModal(false);
          setSelectedInventory(null);
          loadTotals();
        }}
      />
    </ErpLayout>
  );
};

export default WarehouseInventoryPage;
