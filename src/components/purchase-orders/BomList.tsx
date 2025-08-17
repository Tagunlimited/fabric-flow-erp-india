import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Eye, Search, Plus, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils';

interface BomRecord {
  id: string;
  bom_number: string;
  order_id: string;
  order_item_id: string;
  product_name: string;
  product_image_url: string;
  total_order_qty: number;
  created_at: string;
  order: {
    order_number: string;
    customer: {
      company_name: string;
    };
  };
  bom_items: BomRecordItem[];
  order_item?: { fabric_id?: string | null; color?: string | null; gsm?: string | null };
}

interface BomRecordItem {
  id: string;
  bom_id: string;
  item_id: string;
  item_name: string;
  item_code: string;
  category: string;
  unit_of_measure: string;
  qty_per_product: number;
  qty_total: number;
  stock: number;
  to_order: number;
  // Joined item master (if available)
  item?: {
    id: string;
    item_name?: string;
    image_url?: string | null;
    image?: string | null;
    gst_rate?: number | null;
    uom?: string | null;
    item_type?: string | null;
  };
  // Joined fabric (if available)
  fabric?: {
    id: string;
    name?: string | null;
    image_url?: string | null;
    image?: string | null;
    gsm?: string | null;
  };
  // Joined inventory for fabric colors
  inventory?: any[];
}

export function BomList() {
  const navigate = useNavigate();
  const [boms, setBoms] = useState<BomRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBom, setSelectedBom] = useState<BomRecord | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  useEffect(() => {
    fetchBoms();
  }, []);

  const fetchBoms = async () => {
    try {
      setLoading(true);
      // 1) Fetch BOM headers
      const { data: bomHeaders, error: hdrErr } = await supabase
        .from('bom_records')
        .select('*')
        .order('created_at', { ascending: false });
      if (hdrErr) throw hdrErr;

      const bomsArr = (bomHeaders || []) as any[];
      if (bomsArr.length === 0) { setBoms([]); return; }

      // 2) Fetch BOM items for all BOMs
      const bomIds = bomsArr.map((b: any) => b.id as string);
      const { data: bomItems, error: itmErr } = await supabase
        .from('bom_record_items')
        .select('*')
        .in('bom_id', bomIds as any);
      if (itmErr) throw itmErr;

      // 3) Fetch item_master for referenced item_ids (for images/gst/uom)
      const itemIds = Array.from(new Set((bomItems || []).map((x: any) => x.item_id).filter(Boolean))) as string[];
      let itemsMap: Record<string, any> = {};
      if (itemIds.length > 0) {
        // chunk IN queries to be safe
        const chunkSize = 50;
        for (let i = 0; i < itemIds.length; i += chunkSize) {
          const slice = itemIds.slice(i, i + chunkSize);
          const { data: items } = await supabase
            .from('item_master')
            .select('id, item_name, image_url, image, gst_rate, uom, item_type')
            .in('id', slice as any);
          (items || []).forEach((it: any) => { if (it?.id) itemsMap[it.id] = it; });
        }
      }

      // 3b) Fetch fabrics if present (category = 'Fabric'); bom_item stores item_id as fabric_id in that case
      const fabricIds = Array.from(new Set((bomItems || [])
        .filter((x: any) => (x.category === 'Fabric') && x.item_id)
        .map((x: any) => x.item_id))) as string[];
      let fabricsMap: Record<string, any> = {};
      if (fabricIds.length > 0) {
        const chunkSize = 50;
        for (let i = 0; i < fabricIds.length; i += chunkSize) {
          const slice = fabricIds.slice(i, i + chunkSize);
          const { data: fabrics } = await supabase
            .from('fabrics')
            .select('id, name, image_url, gsm')
            .in('id', slice as any);
          (fabrics || []).forEach((f: any) => { if (f?.id) fabricsMap[f.id] = f; });
        }
      }
      
      // 3c) Also fetch inventory for fabric colors
      let inventoryMap: Record<string, any> = {};
      if (fabricIds.length > 0) {
        const chunkSize = 50;
        for (let i = 0; i < fabricIds.length; i += chunkSize) {
          const slice = fabricIds.slice(i, i + chunkSize);
          const { data: inventory } = await supabase
            .from('inventory')
            .select('fabric_id, color, gsm')
            .in('fabric_id', slice as any);
          (inventory || []).forEach((inv: any) => { 
            if (inv?.fabric_id) {
              if (!inventoryMap[inv.fabric_id]) {
                inventoryMap[inv.fabric_id] = [];
              }
              inventoryMap[inv.fabric_id].push(inv);
            }
          });
        }
      }

      // 4) Fetch orders and then customers
      const orderIds = Array.from(new Set((bomsArr || []).map((b: any) => b.order_id).filter(Boolean)));
      let ordersMap: Record<string, { order_number?: string; customer_id?: string }> = {};
      let customerMap: Record<string, { company_name?: string }> = {};
      // also fetch order_items linked (to get fabric_id/color/gsm when present)
      let orderItemMap: Record<string, { fabric_id?: string|null; color?: string|null; gsm?: string|null }> = {};
      if (orderIds.length > 0) {
        const { data: orders } = await supabase
          .from('orders')
          .select('id, order_number, customer_id')
          .in('id', orderIds as any);
        (orders || []).forEach((o: any) => { ordersMap[o.id] = { order_number: o.order_number, customer_id: o.customer_id }; });
        const customerIds = Array.from(new Set((orders || []).map((o: any) => o.customer_id).filter(Boolean)));
        if (customerIds.length > 0) {
          const { data: customers } = await supabase
            .from('customers')
            .select('id, company_name')
            .in('id', customerIds as any);
          (customers || []).forEach((c: any) => { customerMap[c.id] = { company_name: c.company_name }; });
        }
        const { data: orderItems } = await supabase
          .from('order_items')
          .select('id, fabric_id, color, gsm')
          .in('id', ((bomsArr || []).map((b:any) => b.order_item_id).filter(Boolean) as string[]) as any);
        (orderItems || []).forEach((oi: any) => { orderItemMap[oi.id] = { fabric_id: oi.fabric_id, color: oi.color, gsm: oi.gsm }; });
      }

      // 5) Build final structure: attach items and order/customer info
      const itemsByBom: Record<string, any[]> = {};
      (bomItems || []).forEach((bi: any) => {
        const list = itemsByBom[bi.bom_id] || (itemsByBom[bi.bom_id] = []);
        list.push({
          ...bi,
          item: itemsMap[bi.item_id] || undefined,
          fabric: fabricsMap[bi.item_id] || undefined,
          inventory: inventoryMap[bi.item_id] || [],
        });
      });

      const full: BomRecord[] = bomsArr.map((b: any) => ({
        ...b,
        order: { order_number: ordersMap[b.order_id]?.order_number || '', customer: { company_name: customerMap[ordersMap[b.order_id]?.customer_id || '']?.company_name || '' } },
        bom_items: (itemsByBom[b.id] || []) as any,
        order_item: orderItemMap[b.order_item_id] || undefined,
      }));

      setBoms(full);
    } catch (error) {
      console.error('Error fetching BOMs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredBoms = boms.filter(bom => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      bom.product_name?.toLowerCase().includes(term) ||
      bom.order?.order_number?.toLowerCase().includes(term) ||
      bom.order?.customer?.company_name?.toLowerCase().includes(term) ||
      bom.bom_number?.toLowerCase().includes(term)
    );
  });

  const viewBomDetails = (bom: BomRecord) => {
    setSelectedBom(bom);
    setDetailDialogOpen(true);
  };

  const createPurchaseOrderFromBom = (bom: BomRecord) => {
    const parseFabric = (label?: string) => {
      const txt = label || '';
      // Pattern: Name - Color, 200 GSM
      const m = txt.match(/^(.*?)(?:\s*-\s*([^,]+))?(?:,\s*([0-9]+)\s*GSM)?$/i);
      if (!m) return { name: txt, color: '', gsm: '' };
      return { name: (m[1] || '').trim(), color: (m[2] || '').trim(), gsm: (m[3] || '').trim() };
    };
    // Navigate to purchase order form with BOM data
    const bomData = encodeURIComponent(JSON.stringify({
      bomId: bom.id,
      items: bom.bom_items.map(item => {
        if (item.category === 'Fabric') {
          // Prefer values from linked order_item (color/gsm) when available
          const parsed = parseFabric(item.item_name);
          const color = bom.order_item?.color || parsed.color;
          const gsm = bom.order_item?.gsm || (item.fabric as any)?.gsm || parsed.gsm;
          const qty = item.to_order || item.qty_total;
          
          // Use fabric name from fabrics table if available, otherwise parse from item_name
          const fabricName = item.fabric?.name || parsed.name || item.item_name;
          
          // Try to get color from inventory if not available from order_item
          const inventoryColor = color || ((item as any).inventory && (item as any).inventory.length > 0 ? (item as any).inventory[0].color : '');
          
          console.log('Fabric item data:', {
            item_name: item.item_name,
            fabric_name: item.fabric?.name,
            parsed_name: parsed.name,
            final_name: fabricName,
            color: inventoryColor,
            gsm,
            quantity: qty,
            fabric_image: item.fabric?.image_url,
            inventory: (item as any).inventory
          });
          
          return {
            item_type: 'fabric',
            item_id: item.item_id || '',
            item_name: fabricName,
            quantity: qty,
            unit_price: 0,
            unit_of_measure: item.unit_of_measure || 'Kgs',
            item_image_url: item.fabric?.image_url || null,
            fabricSelections: [{ color: inventoryColor || '', gsm: gsm || '', quantity: qty }],
          };
        }
        // Items
        return {
          item_type: 'item',
          item_id: item.item_id || '',
          item_name: item.item_name,
          quantity: item.to_order || item.qty_total,
          unit_price: 0,
          unit_of_measure: item.unit_of_measure,
          item_category: item.category || null,
          gst_rate: item.item?.gst_rate ?? undefined,
          item_image_url: (item.item?.image_url ?? item.item?.image) || null,
          itemSelections: [{
            id: item.item_id || '',
            label: item.item_name,
            image_url: (item.item?.image_url ?? item.item?.image) || null,
            quantity: item.to_order || item.qty_total,
            price: 0
          }]
        };
      })
    }));
    
    navigate(`/procurement/po/new?bom=${bomData}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Bills of Material</h2>
          <p className="text-muted-foreground">Manage and create purchase orders from BOMs</p>
        </div>
        <Button onClick={() => navigate('/procurement')} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-2" /> Create New BOM
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            <CardTitle>All BOMs</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search BOMs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-64"
                />
              </div>
              <Button variant="outline" size="sm" onClick={fetchBoms}>
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>BOM #</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Order #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Total Qty</TableHead>
                    <TableHead>Items Count</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBoms.map((bom) => (
                    <TableRow key={bom.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        {bom.bom_number || `BOM-${bom.id.slice(0, 8)}`}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {bom.product_image_url && (
                            <img 
                              src={bom.product_image_url} 
                              alt={bom.product_name}
                              className="w-8 h-8 rounded object-cover"
                            />
                          )}
                          <span className="line-clamp-1">{bom.product_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{bom.order?.order_number}</TableCell>
                      <TableCell>{bom.order?.customer?.company_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {bom.total_order_qty} pcs
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {bom.bom_items?.length || 0} items
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(bom.created_at).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: '2-digit'
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => viewBomDetails(bom)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => createPurchaseOrderFromBom(bom)}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <FileText className="w-4 h-4 mr-1" />
                            Create PO
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* BOM Details Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>BOM Details</DialogTitle>
          </DialogHeader>
          {selectedBom && (
            <div className="space-y-6">
              {/* BOM Header */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                <div>
                  <h3 className="font-semibold text-lg">{selectedBom.product_name}</h3>
                  <p className="text-sm text-muted-foreground">
                    BOM: {selectedBom.bom_number || `BOM-${selectedBom.id.slice(0, 8)}`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Order: {selectedBom.order?.order_number}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Customer: {selectedBom.order?.customer?.company_name}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{selectedBom.total_order_qty} pcs</div>
                  <p className="text-sm text-muted-foreground">Total Order Quantity</p>
                </div>
              </div>

              {/* BOM Items Table */}
              <div>
                <h4 className="font-semibold mb-3">BOM Items</h4>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Qty per Product</TableHead>
                        <TableHead className="text-right">Total Qty</TableHead>
                        <TableHead className="text-right">In Stock</TableHead>
                        <TableHead className="text-right">To Order</TableHead>
                        <TableHead>UOM</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedBom.bom_items?.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded overflow-hidden bg-muted flex items-center justify-center">
                                {item.category === 'Fabric' ? (
                                  (item.fabric?.image_url || item.fabric?.image) ? (
                                    <img src={(item.fabric?.image_url || item.fabric?.image) as string} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-xs text-muted-foreground">IMG</span>
                                  )
                                ) : (
                                  (item.item?.image_url || item.item?.image) ? (
                                    <img src={(item.item?.image_url || item.item?.image) as string} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-xs text-muted-foreground">IMG</span>
                                  )
                                )}
                              </div>
                              <div>
                                <div className="font-medium">{item.category === 'Fabric' ? (item.fabric?.name || item.item_name) : item.item_name}</div>
                                {item.item_code && (
                                  <div className="text-sm text-muted-foreground">
                                    Code: {item.item_code}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.category}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {item.qty_per_product}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {item.qty_total}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={item.stock < item.qty_total ? 'text-red-600' : 'text-green-600'}>
                              {item.stock}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            <span className="text-blue-600">{item.to_order}</span>
                          </TableCell>
                          <TableCell>{item.unit_of_measure}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setDetailDialogOpen(false)}
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    setDetailDialogOpen(false);
                    createPurchaseOrderFromBom(selectedBom);
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Create Purchase Order
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
