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

  const loadTotals = async () => {
    // Fetch totals by status; filter location type client-side to avoid RLS join issues
    const { data, error } = await supabase
      .from('warehouse_inventory' as any)
      .select(`
        quantity,
        status,
        bin:bin_id (
          id,
          location_type
        )
      `);
    if (error) return;
    const rows = (data as any) || [];
    const receivingQty = rows
      .filter((r: any) => r.status === 'RECEIVED' && r.bin?.location_type === 'RECEIVING_ZONE')
      .reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);
    const storageQty = rows
      .filter((r: any) => r.status === 'IN_STORAGE' && r.bin?.location_type === 'STORAGE')
      .reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);
    const dispatchQty = rows
      .filter((r: any) => r.status === 'READY_TO_DISPATCH' && r.bin?.location_type === 'DISPATCH_ZONE')
      .reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);
    const allQty = rows.reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);
    setTotals({ receiving: receivingQty, storage: storageQty, dispatch: dispatchQty, all: allQty });
  };

  useEffect(() => {
    loadTotals();
    const handler = () => loadTotals();
    window.addEventListener('warehouse-inventory-updated', handler as any);
    return () => window.removeEventListener('warehouse-inventory-updated', handler as any);
  }, []);

  const loadRelatedDetails = async (inv: WarehouseInventory) => {
    try {
      setLoadingDetails(true);
      setGrnHeader(null);
      setPoHeader(null);
      setBomItems([]);

      let grnData: any = null;
      {
        const { data, error } = await supabase
          .from('grn_master' as any)
          .select(`id, grn_number, grn_date, received_date, status, po_id,
                   supplier_master:supplier_id (supplier_name, supplier_code),
                   purchase_orders:po_id (id, po_number, status)`)
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

      let poData = grnData?.purchase_orders || null;
      const poId = grnData?.po_id || grnData?.purchase_orders?.id;
      if (!poData && poId) {
        const { data } = await supabase
          .from('purchase_orders' as any)
          .select('id, po_number, status, total_amount, supplier_id')
          .eq('id', poId as any)
          .single();
        if (data) poData = data;
      }
      if (poData) setPoHeader(poData);

      if (inv.item_id || inv.item_code) {
        let query = supabase
          .from('bom_record_items' as any)
          .select(`id, bom_id, item_name, item_code, unit_of_measure, qty_per_product, qty_total,
                   bom_records:bom_id (id, product_name, status)`) 
          .limit(25);
        if (inv.item_id) query = query.eq('item_id', inv.item_id as any);
        else if (inv.item_code) query = query.eq('item_code', inv.item_code as any);
        const { data } = await query;
        if (data) setBomItems(data as any[]);
      }
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
      <div className="container mx-auto p-6 space-y-6">
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
            Receiving Zone
          </TabsTrigger>
          <TabsTrigger value="storage" className="flex items-center gap-2">
            <Archive className="h-4 w-4" />
            Storage Zone
          </TabsTrigger>
          <TabsTrigger value="dispatch" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Dispatch Zone
          </TabsTrigger>
        </TabsList>

        <TabsContent value="receiving" className="space-y-4">
          <ReceivingZoneInventory
            onTransferItem={handleTransferItem}
            onViewDetails={handleViewDetails}
          />
        </TabsContent>

        <TabsContent value="storage" className="space-y-4">
          <StorageZoneInventory onViewDetails={handleViewDetails} />
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
                <h3 className="font-semibold">Related Records</h3>
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
