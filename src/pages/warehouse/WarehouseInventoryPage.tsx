import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Package, 
  Archive, 
  Truck, 
  BarChart3,
  ArrowRightLeft
} from 'lucide-react';
import { ReceivingZoneInventory } from '@/components/warehouse/ReceivingZoneInventory';
import { StorageZoneInventory } from '@/components/warehouse/StorageZoneInventory';
import { InventoryTransferModal } from '@/components/warehouse/InventoryTransferModal';
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
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [grnHeader, setGrnHeader] = useState<any | null>(null);
  const [poHeader, setPoHeader] = useState<any | null>(null);
  const [bomItems, setBomItems] = useState<any[]>([]);
  const [relatedOrders, setRelatedOrders] = useState<any[]>([]);

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
          bin:bin_id (
            id,
            location_type
          )
        `)
        .in('item_type', ['FABRIC', 'ITEM'] as any);
      
      if (error) {
        console.error('Error fetching warehouse inventory totals:', error);
        setTotals({ receiving: 0, storage: 0, dispatch: 0, all: 0 });
        return;
      }
      
      const rows = (data as any) || [];
      console.log('Warehouse inventory rows:', rows);
      
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
      
      console.log('Warehouse inventory totals:', { receiving: receivingQty, storage: storageQty, dispatch: dispatchQty, all: allQty });
      setTotals({ receiving: receivingQty, storage: storageQty, dispatch: dispatchQty, all: allQty });
    } catch (error) {
      console.error('Error in loadTotals:', error);
      setTotals({ receiving: 0, storage: 0, dispatch: 0, all: 0 });
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

      console.log('Loading related details for inventory:', inv);

      // 1. Fetch GRN Header
      let grnData: any = null;
      {
        const { data, error } = await supabase
          .from('grn_master' as any)
          .select(`id, grn_number, grn_date, received_date, status, po_id,
                   supplier_master:supplier_id (supplier_name, supplier_code),
                   purchase_orders:po_id (id, po_number, status, bom_id)`)
          .eq('id', inv.grn_id as any)
          .single();
        if (!error && data) {
          grnData = data;
          console.log('GRN fetched:', grnData);
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
        console.log('PO fetched:', poData);

        // 3. Fetch BOM from PO
        if (poData.bom_id) {
          console.log('PO has BOM ID:', poData.bom_id);
          
          const { data: bomData } = await supabase
            .from('bom_records' as any)
            .select(`id, bom_number, product_name, status, order_id,
                     bom_record_items(*)`)
            .eq('id', poData.bom_id as any)
            .single();

          if (bomData) {
            console.log('BOM fetched:', bomData);
            const bomOrderId = (bomData as any).order_id;
            console.log('BOM order_id:', bomOrderId);

            // 4. Fetch Order from BOM
            if (bomOrderId) {
              const { data: orderData } = await supabase
                .from('orders' as any)
                .select(`id, order_number, order_date, status, final_amount, customer_id,
                          customers:customer_id (company_name)`)
                .eq('id', bomOrderId as any)
                .single();

              if (orderData) {
                console.log('Order fetched:', orderData);
                setRelatedOrders([orderData]);
              }
            }
          }
        }

        // Alternative approach: Match BOM items by item_id/item_code to find related orders
        if (inv.item_id || inv.item_code) {
          console.log('Searching for BOM items matching item_id:', inv.item_id, 'or item_code:', inv.item_code);
          
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
            console.log('Found BOM items:', bomItemsData.length);
            setBomItems(bomItemsData as any[]);

            // Extract and fetch unique orders from BOM items
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
                console.log('Fetched orders from BOM items:', ordersData);
                setRelatedOrders(ordersData as any[]);
              }
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
      <div className="w-full p-6 space-y-6">
        <div className="flex items-center">
          <BackButton to="/inventory" label="Back to Inventory" />
        </div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Warehouse Inventory Management</h1>
          <p className="text-muted-foreground">
            Track and manage GRN items across warehouse zones
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            <Package className="h-3 w-3" />
            Receiving Zone
          </Badge>
          <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          <Badge variant="outline" className="flex items-center gap-1">
            <Archive className="h-3 w-3" />
            Storage Zone
          </Badge>
          <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          <Badge variant="outline" className="flex items-center gap-1">
            <Truck className="h-3 w-3" />
            Dispatch Zone
          </Badge>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Receiving Zone</p>
                <p className="text-2xl font-bold">{Math.round(totals.receiving)}</p>
                <p className="text-xs text-muted-foreground">Total quantity received</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Archive className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Storage Zone</p>
                <p className="text-2xl font-bold">{Math.round(totals.storage)}</p>
                <p className="text-xs text-muted-foreground">Total quantity in storage</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Truck className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Dispatch Zone</p>
                <p className="text-2xl font-bold">{Math.round(totals.dispatch)}</p>
                <p className="text-xs text-muted-foreground">Total quantity ready to dispatch</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <BarChart3 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Items</p>
                <p className="text-2xl font-bold">{Math.round(totals.all)}</p>
                <p className="text-xs text-muted-foreground">Total quantity across zones</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="receiving" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Receiving Zone ({totals.receiving})
          </TabsTrigger>
          <TabsTrigger value="storage" className="flex items-center gap-2">
            <Archive className="h-4 w-4" />
            Storage Zone ({totals.storage})
          </TabsTrigger>
          <TabsTrigger value="dispatch" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Dispatch Zone ({totals.dispatch})
          </TabsTrigger>
        </TabsList>
        
        {/* Debug Information */}
        {totals.all === 0 && (
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center gap-2 text-yellow-700 mb-2">
              <Package className="w-4 h-4" />
              <span className="font-medium">No items found in warehouse inventory</span>
            </div>
            <div className="text-sm text-yellow-600 space-y-1">
              <p>This could mean:</p>
              <ul className="list-disc list-inside ml-4 space-y-1">
                <li>No GRNs have been approved yet</li>
                <li>Warehouse inventory tables need to be set up</li>
                <li>Approved GRN items haven't been moved to warehouse inventory</li>
              </ul>
              <p className="mt-2 font-medium">To fix this:</p>
              <ol className="list-decimal list-inside ml-4 space-y-1">
                <li>Run the <code className="bg-yellow-100 px-1 rounded">setup_warehouse_inventory_complete.sql</code> script in Supabase</li>
                <li>Approve some GRNs using the GRN approval workflow</li>
                <li>Check that approved items are being inserted into warehouse_inventory table</li>
              </ol>
            </div>
          </div>
        )}

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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Dispatch Zone Inventory
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Truck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Dispatch zone inventory coming soon...</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Items ready for dispatch will appear here
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Transfer Modal */}
      <InventoryTransferModal
        open={showTransferModal}
        onOpenChange={setShowTransferModal}
        inventory={selectedInventory}
        onTransferComplete={handleTransferComplete}
      />

      {/* View Details Modal */}
      {selectedInventory && (
        <div className={`fixed inset-0 z-50 ${showViewModal ? '' : 'hidden'}`}>
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowViewModal(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border rounded-lg shadow-lg w-[90vw] max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">Inventory Details</h2>
              <button className="text-sm" onClick={() => setShowViewModal(false)}>Close</button>
            </div>
            <div className="p-4 space-y-4">
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

              {/* GRN Item Attributes */}
              <div className="pt-2 border-t">
                <h3 className="font-semibold mb-2">GRN Item Attributes</h3>
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
              </div>

              {/* Related Records */}
              <div className="pt-2 border-t space-y-4">
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
                      <button
                        className="text-blue-600 text-sm underline"
                        onClick={() => navigate(`/procurement/grn/${grnHeader.id}`)}
                      >
                        View GRN
                      </button>
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
                      <button
                        className="text-blue-600 text-sm underline"
                        onClick={() => navigate(`/procurement/po/${poHeader.id}`)}
                      >
                        View PO
                      </button>
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
                          <button
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-4 rounded-md font-medium transition-colors"
                            onClick={() => navigate(`/orders/${order.id}`)}
                          >
                            View Order Details
                          </button>
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
                                  <button
                                    className="text-blue-600 text-xs underline"
                                    onClick={() => navigate(`/bom/${bi.bom_records.id}`)}
                                  >
                                    View
                                  </button>
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
          </div>
        </div>
      )}
      </div>
    </ErpLayout>
  );
};

export default WarehouseInventoryPage;
