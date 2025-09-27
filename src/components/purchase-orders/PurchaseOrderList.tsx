import { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, RefreshCw, Eye, Pencil, Trash2, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ItemImage } from '@/components/ui/OptimizedImage';

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

// Memoized row component for better performance
const PurchaseOrderRow = memo(function PurchaseOrderRow({ 
  po, 
  supplier, 
  imageUrl, 
  onView, 
  onEdit, 
  onDelete 
}: {
  po: PurchaseOrder;
  supplier: Supplier | undefined;
  imageUrl: string | null;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
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
    <TableRow>
      <TableCell className="font-medium">{po.po_number}</TableCell>
      <TableCell>
        <div className="text-sm">
          <div className="font-medium">{supplier?.supplier_name || '-'}</div>
          <div className="text-xs text-muted-foreground">{supplier?.supplier_code || ''}</div>
        </div>
      </TableCell>
      <TableCell>{po.order_date ? format(new Date(po.order_date), 'dd MMM yyyy') : '-'}</TableCell>
      <TableCell>
        <ItemImage 
          src={imageUrl} 
          alt="item" 
          className="w-12 h-12 object-cover rounded"
        />
      </TableCell>
      <TableCell>{po.total_amount != null ? po.total_amount.toFixed(2) : '-'}</TableCell>
      <TableCell>{statusBadge(po.status)}</TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onView(po.id)}>
            <Eye className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onEdit(po.id)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDelete(po.id)}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});

const PurchaseOrderList = memo(function PurchaseOrderList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, Supplier>>({});
  const [firstItemImageByPoId, setFirstItemImageByPoId] = useState<Record<string, string | null>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PurchaseOrder['status']>('all');

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      
      // Use a single query with joins to reduce database round trips
      const { data: poData, error: poErr } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          supplier:supplier_master(id, supplier_name, supplier_code),
          items:purchase_order_items(po_id, item_image_url, line_total, total_price, gst_amount, gst_rate)
        `)
        .order('created_at', { ascending: false });
      
      if (poErr) throw poErr;

      // Process the joined data
      const supplierMap: Record<string, Supplier> = {};
      const firstImageMap: Record<string, string | null> = {};
      const totalsMap: Record<string, number> = {};
      const processedPOs: PurchaseOrder[] = [];

      (poData || []).forEach((po: any) => {
        // Process supplier data
        if (po.supplier) {
          supplierMap[po.supplier.id] = {
            id: po.supplier.id,
            supplier_name: po.supplier.supplier_name,
            supplier_code: po.supplier.supplier_code
          };
        }

        // Process items data
        if (po.items && Array.isArray(po.items)) {
          po.items.forEach((item: ItemRowLite) => {
            // Pick first non-null image only
            if (firstImageMap[item.po_id] == null && item.item_image_url) {
              firstImageMap[item.po_id] = item.item_image_url;
            }
            // Compute line total fallback
            const tp = item.total_price || 0;
            const ga = item.gst_amount != null ? item.gst_amount : tp * ((item.gst_rate || 0) / 100);
            const lt = item.line_total != null ? item.line_total : tp + ga;
            totalsMap[item.po_id] = (totalsMap[item.po_id] || 0) + lt;
          });
        }

        // Process PO data
        const computed = totalsMap[po.id];
        const processedPO: PurchaseOrder = {
          id: po.id,
          po_number: po.po_number,
          supplier_id: po.supplier_id,
          order_date: po.order_date,
          expected_delivery_date: po.expected_delivery_date,
          subtotal: po.subtotal,
          tax_amount: po.tax_amount,
          total_amount: (po.total_amount == null || po.total_amount === 0) && computed > 0 ? computed : po.total_amount,
          status: po.status,
          created_at: po.created_at
        };
        processedPOs.push(processedPO);
      });

      setPurchaseOrders(processedPOs);
      setSuppliers(supplierMap);
      setFirstItemImageByPoId(firstImageMap);
    } catch (e) {
      console.error('Failed to fetch purchase orders', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filteredPOs = useMemo(() => {
    return purchaseOrders.filter((po) => {
      const s = suppliers[po.supplier_id];
      const text = `${po.po_number} ${(s?.supplier_name || '')} ${(s?.supplier_code || '')}`.toLowerCase();
      const matchesSearch = !search || text.includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || po.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [purchaseOrders, suppliers, search, statusFilter]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this purchase order?')) return;
    await supabase.from('purchase_orders').delete().eq('id', id);
    fetchAll();
  }, [fetchAll]);

  const handleView = useCallback((id: string) => {
    navigate(`/procurement/po/${id}`);
  }, [navigate]);

  const handleEdit = useCallback((id: string) => {
    navigate(`/procurement/po/${id}?edit=1`);
  }, [navigate]);

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
          <Button variant="outline" onClick={() => navigate('/procurement/bom')}>
            <ClipboardList className="w-4 h-4 mr-2" /> Create from BOM
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
                      <PurchaseOrderRow
                        key={po.id}
                        po={po}
                        supplier={sup}
                        imageUrl={img}
                        onView={handleView}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
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
});

export { PurchaseOrderList };


