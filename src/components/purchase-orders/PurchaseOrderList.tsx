import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, RefreshCw, Eye, Pencil, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

type PurchaseOrder = {
  id: string;
  po_number: string;
  supplier_id: string;
  order_date: string;
  expected_delivery_date: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  status: 'draft' | 'submitted' | 'approved' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
};

type Supplier = { id: string; supplier_name: string; supplier_code: string };

type FirstItemImage = { po_id: string; item_image_url: string | null };
type ItemRowLite = { po_id: string; item_image_url: string | null; line_total: number | null; total_price: number | null; gst_amount: number | null; gst_rate: number | null };

export function PurchaseOrderList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, Supplier>>({});
  const [firstItemImageByPoId, setFirstItemImageByPoId] = useState<Record<string, string | null>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PurchaseOrder['status']>('all');

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const { data: poData, error: poErr } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (poErr) throw poErr;

      const supplierIds = Array.from(new Set((poData || []).map((p) => p.supplier_id))).filter(Boolean) as string[];
      const { data: supplierData, error: supErr } = await supabase
        .from('supplier_master')
        .select('id, supplier_name, supplier_code')
        .in('id', supplierIds);
      if (supErr) throw supErr;

      const supplierMap: Record<string, Supplier> = {};
      (supplierData || []).forEach((s) => (supplierMap[s.id] = s as Supplier));

      const poIds = (poData || []).map((p) => p.id);
      const { data: itemsData } = await supabase
        .from('purchase_order_items')
        .select('po_id, item_image_url, line_total, total_price, gst_amount, gst_rate')
        .in('po_id', poIds);
      const firstImageMap: Record<string, string | null> = {};
      const totalsMap: Record<string, number> = {};
      (itemsData as ItemRowLite[] | null || []).forEach((row) => {
        // Pick first non-null image only
        if (firstImageMap[row.po_id] == null && row.item_image_url) {
          firstImageMap[row.po_id] = row.item_image_url;
        }
        // Compute line total fallback
        const tp = row.total_price || 0;
        const ga = row.gst_amount != null ? row.gst_amount : tp * ((row.gst_rate || 0) / 100);
        const lt = row.line_total != null ? row.line_total : tp + ga;
        totalsMap[row.po_id] = (totalsMap[row.po_id] || 0) + lt;
      });

      const merged = (poData || []).map((po) => {
        const computed = totalsMap[po.id];
        if ((po.total_amount == null || po.total_amount === 0) && computed > 0) {
          return { ...po, total_amount: computed } as PurchaseOrder;
        }
        return po as PurchaseOrder;
      });
      setPurchaseOrders(merged);
      setSuppliers(supplierMap);
      setFirstItemImageByPoId(firstImageMap);
    } catch (e) {
      console.error('Failed to fetch purchase orders', e);
    } finally {
      setLoading(false);
    }
  };

  const filteredPOs = useMemo(() => {
    return purchaseOrders.filter((po) => {
      const s = suppliers[po.supplier_id];
      const text = `${po.po_number} ${(s?.supplier_name || '')} ${(s?.supplier_code || '')}`.toLowerCase();
      const matchesSearch = !search || text.includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || po.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [purchaseOrders, suppliers, search, statusFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this purchase order?')) return;
    await supabase.from('purchase_orders').delete().eq('id', id);
    fetchAll();
  };

  const statusBadge = (status: PurchaseOrder['status']) => {
    const map: Record<PurchaseOrder['status'], string> = {
      draft: 'bg-gray-100 text-gray-800 border-gray-200',
      submitted: 'bg-blue-100 text-blue-800 border-blue-200',
      approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      in_progress: 'bg-amber-100 text-amber-800 border-amber-200',
      completed: 'bg-green-100 text-green-800 border-green-200',
      cancelled: 'bg-red-100 text-red-800 border-red-200',
    };
    return <Badge variant="outline" className={`font-medium ${map[status]}`}>{status.replace('_',' ')}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground">Create and manage purchase orders</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchAll}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button onClick={() => navigate('/procurement/po/new')}>
            <Plus className="w-4 h-4 mr-2" /> New PO
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="flex-1">
              <Input placeholder="Search by PO number or supplier..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-full md:w-56">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Purchase Orders ({filteredPOs.length})</CardTitle>
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
                    <TableHead>PO</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Image</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPOs.map((po) => {
                    const sup = suppliers[po.supplier_id];
                    const img = firstItemImageByPoId[po.id];
                    return (
                      <TableRow key={po.id}>
                        <TableCell className="font-medium">{po.po_number}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="font-medium">{sup?.supplier_name || '-'}</div>
                            <div className="text-xs text-muted-foreground">{sup?.supplier_code || ''}</div>
                          </div>
                        </TableCell>
                        <TableCell>{po.order_date ? format(new Date(po.order_date), 'dd MMM yyyy') : '-'}</TableCell>
                        <TableCell>
                          {img ? (
                            <img src={img} alt="item" className="w-12 h-12 object-cover rounded" />
                          ) : (
                            <div className="w-12 h-12 rounded bg-muted" />
                          )}
                        </TableCell>
                        <TableCell>{po.total_amount != null ? po.total_amount.toFixed(2) : '-'}</TableCell>
                        <TableCell>{statusBadge(po.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => navigate(`/procurement/po/${po.id}`)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => navigate(`/procurement/po/${po.id}?edit=1`)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleDelete(po.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


