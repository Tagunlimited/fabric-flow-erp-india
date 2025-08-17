import { format } from 'date-fns';
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Eye, Filter, Search, PlusCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useOrdersWithReceipts } from "@/hooks/useOrdersWithReceipts";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card as UICard } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  customer_id: string;
  customer: { company_name: string };
  status: string;
  total_amount: number;
  final_amount: number;
  balance_amount: number;
}

export default function ProcurementPage() {
  const navigate = useNavigate();
  const { orders, loading, refetch } = useOrdersWithReceipts<Order>();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [selectProductOpen, setSelectProductOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<any | null>(null);
  const [dialogStep, setDialogStep] = useState<'products' | 'builder'>('products');
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [totalQty, setTotalQty] = useState<number>(0);
  const [itemMaster, setItemMaster] = useState<any[]>([]);
  const [bomRows, setBomRows] = useState<Array<{ id: string; item_id?: string|null; item_code?: string; item_name: string; category?: string; uom?: string; qty_per: number; qty_total: number; stock: number; to_order: number; locked?: boolean }>>([]);
  const [generated, setGenerated] = useState(false);
  const [fabricMap, setFabricMap] = useState<Record<string, { name: string }>>({});
  const [selectedFabricLabel, setSelectedFabricLabel] = useState<string>('');

  const openBomForOrder = async (o: any) => {
    setActiveOrder(o);
    setSelectProductOpen(true);
    setDialogStep('products');
    const { data } = await supabase
      .from('order_items')
      .select('id, product_description, category_image_url, quantity, fabric_id, color, gsm')
      .eq('order_id', o.id);
    setOrderItems(data || []);

    // Fetch fabric names for referenced fabric_ids so we can display Fabric name - Color, GSM
    try {
      const uniqueFabricIds = Array.from(new Set((data || []).map((d: any) => d.fabric_id).filter(Boolean)));
      if (uniqueFabricIds.length > 0) {
        const { data: fabricsData } = await supabase
          .from('fabrics')
          .select('id, name')
          .in('id', uniqueFabricIds as string[]);
        const map: Record<string, { name: string }> = {};
        (fabricsData || []).forEach((f: any) => { if (f?.id) map[f.id] = { name: f.name }; });
        setFabricMap(map);
      } else {
        setFabricMap({});
      }
    } catch {
      setFabricMap({});
    }
    const { data: items } = await supabase
      .from('item_master')
      .select('id, item_code, item_name, item_type, uom, current_stock, color, size, material, brand, image')
      .eq('is_active', true);
    setItemMaster(items || []);
    setSelectedItem(null);
    setBomRows([]);
    setGenerated(false);
    setSelectedFabricLabel('');
  };

  const fetchStocksMap = async (codes: string[]) => {
    const codeSet = Array.from(new Set(codes.filter(Boolean)));
    const result: Record<string, number> = {};
    if (codeSet.length === 0) return result;
    try {
      const { data, error } = await supabase.from('inventory').select('item_code, quantity').limit(10000);
      if (!error && data) {
        for (const r of data) if (r.item_code) result[r.item_code] = Number(r.quantity) || 0;
      }
    } catch {}
    try {
      const { data } = await supabase.from('item_master').select('item_code, stock, current_stock').limit(10000);
      if (data) {
        for (const r of data) {
          const v = r.current_stock ?? r.stock;
          if (r.item_code && typeof v !== 'undefined' && v !== null) result[r.item_code] = Number(v) || 0;
        }
      }
    } catch {}
    return result;
  };

  useEffect(() => {
    // hook fetches on mount
  }, []);

  const fetchOrders = async () => { await refetch(); };

  const filteredOrders = useMemo(() => {
    return orders
      .filter(o => !filterStatus || o.status === filterStatus)
      .filter(o => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
          o.order_number?.toLowerCase().includes(term) ||
          o.customer?.company_name?.toLowerCase().includes(term)
        );
      });
  }, [orders, filterStatus, searchTerm]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'in_production': return 'bg-purple-100 text-purple-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Procurement</h1>
          <p className="text-muted-foreground mt-1">Orders with receipts for procurement actions</p>
        </div>
        <Button onClick={() => setSelectProductOpen(true)} className="rounded-full bg-emerald-600 hover:bg-emerald-700">
          <PlusCircle className="w-4 h-4 mr-2" /> Create BOM
        </Button>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              <CardTitle>Orders with Receipts</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSearchTerm(s => s ? "" : s)}>
                  <Search className="w-4 h-4 mr-2" /> Search
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Filter className="w-4 h-4 mr-2" /> Filter
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setFilterStatus(null)} className={!filterStatus ? 'bg-accent/20 font-semibold' : ''}>All Statuses</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterStatus('pending')} className={filterStatus==='pending' ? 'bg-accent/20 font-semibold' : ''}>Pending</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterStatus('confirmed')} className={filterStatus==='confirmed' ? 'bg-accent/20 font-semibold' : ''}>Confirmed</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterStatus('in_production')} className={filterStatus==='in_production' ? 'bg-accent/20 font-semibold' : ''}>In Production</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterStatus('completed')} className={filterStatus==='completed' ? 'bg-accent/20 font-semibold' : ''}>Completed</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                 <Button variant="outline" size="sm" onClick={fetchOrders}>Refresh</Button>
              </div>
            </div>
            {searchTerm && (
              <div className="mt-2">
                <Input placeholder="Search by order # or customer" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="max-w-xs" />
              </div>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                 <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map(o => (
                      <TableRow key={o.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium">{o.order_number}</TableCell>
                        <TableCell>{o.customer?.company_name}</TableCell>
                        <TableCell>{new Date(o.order_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(o.status)}>{o.status.replace('_', ' ').toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell>₹{(o.final_amount || 0).toFixed(2)}</TableCell>
                        <TableCell>₹{(o.balance_amount || 0).toFixed(2)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => navigate(`/orders/${o.id}`)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => openBomForOrder(o)}>
                              Create BOM
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

        {/* Select Product Modal */}
        <Dialog open={selectProductOpen} onOpenChange={(v) => { setSelectProductOpen(v); if (!v) { setDialogStep('products'); setOrderItems([]); setSelectedItem(null); setBomRows([]); setGenerated(false); setSelectedFabricLabel(''); } }}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{dialogStep === 'products' ? 'Select Product' : 'Create Bill of Materials'}</DialogTitle>
            </DialogHeader>
            {dialogStep === 'products' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {orderItems.map((it) => (
                  <div key={it.id} className="border rounded-lg p-3 flex gap-3 items-center">
                    <div className="w-16 h-16 bg-muted rounded overflow-hidden flex items-center justify-center">
                      {it.category_image_url ? (<img src={it.category_image_url} className="w-full h-full object-cover" />) : (<span className="text-xs text-muted-foreground">IMG</span>)}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium line-clamp-1">{it.product_description}</div>
                      <div className="text-xs text-muted-foreground">Qty: {it.quantity}</div>
                      {it.fabric_id && (
                        <div className="text-xs text-muted-foreground">
                          {(fabricMap[it.fabric_id]?.name || 'Fabric')}
                          {it.color ? ` - ${it.color}` : ''}
                          {it.gsm ? `, ${it.gsm} GSM` : ''}
                        </div>
                      )}
                    </div>
                    <Button size="sm" onClick={async () => {
                      setSelectedItem(it);
                      setTotalQty(Number(it.quantity) || 0);
                      let fabricRow: any[] = [];
                      try {
                        if (it.fabric_id) {
                          const { data: fab } = await supabase
                            .from('fabrics')
                            .select('name, gsm, stock, available_qty, color')
                            .eq('id', it.fabric_id)
                            .maybeSingle();
                          const fabricName =fabricMap[it.fabric_id]?.name || 'Fabric';
                          const fabricColor = it.color || fab?.color;
                          const fabricGsm = it.gsm || fab?.gsm;
                          const name = `${fabricName}${fabricColor ? ' - ' + fabricColor : ''}${fabricGsm ? ', ' + fabricGsm + ' GSM' : ''}`;
                          setSelectedFabricLabel(name);
                          const stockVal = Number(fab?.available_qty ?? fab?.stock ?? 0) || 0;
                          fabricRow = [{ id: crypto.randomUUID(), item_id: it.fabric_id || null, item_name: name, category: 'Fabric', uom: 'Kgs', qty_per: 0, qty_total: 0, stock: stockVal, to_order: 0, locked: true }];
                        }
                      } catch {}
                      setBomRows(fabricRow);
                      setDialogStep('builder');
                      setGenerated(false);
                    }}>Select</Button>
                  </div>
                ))}
              </div>
            )}
            {dialogStep === 'builder' && selectedItem && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">ORDER ID: {activeOrder?.order_number}</div>
                    <div className="font-semibold">Product: {selectedItem.product_description}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Total Order Qty</div>
                    <div className="text-xl font-bold">{totalQty} Pcs</div>
                  </div>
                </div>
                {selectedFabricLabel && (
                  <div className="text-sm text-muted-foreground">Fabric: {selectedFabricLabel}</div>
                )}
                <div className="flex gap-4">
                  <div className="w-28 h-28 rounded overflow-hidden border">
                    {selectedItem.category_image_url ? (<img src={selectedItem.category_image_url} className="w-full h-full object-cover" />) : null}
                  </div>
                  <div className="flex-1 min-w-0 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Item Category</th>
                          <th className="text-right p-2">Required Qty (1 pc)</th>
                          {generated && (<th className="text-right p-2">Required Qty (Total)</th>)}
                          {generated && (<th className="text-right p-2">In Stock</th>)}
                          {generated && (<th className="text-right p-2">To Order</th>)}
                          <th className="p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {bomRows.map((row, idx) => (
                          <tr key={row.id} className="border-b">
                            <td className="p-2 min-w-[220px]">
                              {row.locked ? (
                                <div className="font-medium">{row.item_name}</div>
                              ) : (
                                <select
                                  className="w-full border rounded px-2 py-1"
                                  value={row.item_code || ''}
                                  onChange={(e) => {
                                    const code = e.target.value || '';
                                    const meta = itemMaster.find((m) => m.item_code === code);
                                    setBomRows((prev) => prev.map((r, i) => i === idx ? { ...r, item_id: meta?.id || null, item_code: code, item_name: meta?.item_name || '', category: meta?.item_type, uom: meta?.uom } : r));
                                  }}
                                >
                                  <option value="">Select item (by code)...</option>
                                  {itemMaster.map((im) => (
                                    <option key={im.item_code} value={im.item_code}>{im.item_code} — {im.item_name}</option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="p-2 text-right">
                              <input type="number" className="w-24 border rounded px-2 py-1 text-right" value={row.qty_per}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value) || 0;
                                  setBomRows((prev) => prev.map((r, i) => i === idx ? { ...r, qty_per: v, qty_total: v * totalQty, to_order: Math.max((v * totalQty) - (r.stock || 0), 0) } : r));
                                }} disabled={row.locked && false} />
                            </td>
                            {generated && (<td className="p-2 text-right">{(row.qty_total || 0).toLocaleString()}</td>)}
                            {generated && (
                              <td className="p-2 text-right">
                                <input type="number" className="w-24 border rounded px-2 py-1 text-right" value={row.stock}
                                  onChange={(e) => {
                                    const v = parseFloat(e.target.value) || 0;
                                    setBomRows((prev) => prev.map((r, i) => i === idx ? { ...r, stock: v, to_order: Math.max((r.qty_total || 0) - v, 0) } : r));
                                  }} />
                              </td>
                            )}
                            {generated && (<td className="p-2 text-right font-semibold">{(row.to_order || 0).toLocaleString()}</td>)}
                            <td className="p-2 text-right">
                              {!row.locked && (
                                <Button variant="outline" size="sm" onClick={() => setBomRows((prev) => prev.filter((_, i) => i !== idx))}>Remove</Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex justify-between mt-3">
                      <Button variant="outline" size="sm" onClick={() => setBomRows((prev) => [...prev, { id: crypto.randomUUID(), item_id: null, item_code: '', item_name: '', category: '', uom: '', qty_per: 0, qty_total: 0, stock: 0, to_order: 0 }])}>Add Item Row</Button>
                      <div className="space-x-2">
                        <Button variant="outline" size="sm" onClick={async () => {
                          setBomRows((prev) => prev.map((r) => ({ ...r, qty_total: (r.qty_per || 0) * totalQty })));
                          const codes = bomRows.map((r) => r.item_code || '').filter(Boolean);
                          const stocks = await fetchStocksMap(codes);
                          setBomRows((prev) => prev.map((r) => {
                            const s = r.item_code ? (stocks[r.item_code] ?? r.stock ?? 0) : r.stock;
                            const toOrder = Math.max(((r.qty_per || 0) * totalQty) - (Number(s) || 0), 0);
                            return { ...r, stock: Number(s) || 0, to_order: toOrder, qty_total: (r.qty_per || 0) * totalQty };
                          }));
                          setGenerated(true);
                        }}>Generate BOM</Button>
                        <Button size="sm" onClick={async () => {
                          if (!activeOrder || !selectedItem) return;
                          const { data: bom, error } = await supabase.from('bom_records').insert({ order_id: activeOrder.id, order_item_id: selectedItem.id, product_name: selectedItem.product_description, product_image_url: selectedItem.category_image_url, total_order_qty: totalQty }).select('id').single();
                          if (error || !bom?.id) { toast.error('Failed to save BOM'); return; }
                          if (bom?.id) {
                            const rows = bomRows.map((r) => ({ bom_id: bom.id, item_id: r.item_id || null, item_code: r.item_code || null, item_name: r.item_name, category: r.category, unit_of_measure: r.uom, qty_per_product: r.qty_per, qty_total: r.qty_total, stock: r.stock, to_order: r.to_order }));
                            const { error: e2 } = await supabase.from('bom_record_items').insert(rows);
                            if (e2) { toast.error('Failed to save BOM items'); return; }
                          }
                          toast.success('BOM saved');
                          setSelectProductOpen(false);
                        }}>Save BOM</Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </ErpLayout>
  );
}


