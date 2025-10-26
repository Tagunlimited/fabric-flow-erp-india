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
type ItemRowLite = { 
  po_id: string; 
  item_image_url: string | null; 
  remarks: string | null; 
  quantity: number; 
  unit_of_measure: string | null;
  item_name: string | null;
  item_type: string | null;
  fabric_name: string | null;
  fabric_color: string | null;
  fabric_gsm: string | null;
  notes: string | null;
};

// Memoized row component for better performance
const PurchaseOrderRow = memo(function PurchaseOrderRow({ 
  po, 
  supplier, 
  imageUrl, 
  totalQuantity,
  items,
  onView, 
  onEdit, 
  onDelete 
}: {
  po: PurchaseOrder;
  supplier: Supplier | undefined;
  imageUrl: string | null;
  totalQuantity: { total: number; uom: string } | undefined;
  items: ItemRowLite[];
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
      <TableCell>
        <div className="text-sm space-y-1">
          {items.slice(0, 2).map((item, idx) => (
            <div key={idx} className="border-b border-gray-100 pb-1 last:border-b-0">
              <div className="font-medium">{item.item_name || 'N/A'}</div>
              {item.item_type === 'fabric' && (
                <div className="text-xs text-muted-foreground">
                  {item.fabric_name && `${item.fabric_name} - `}
                  {item.fabric_color && `${item.fabric_color}, `}
                  {item.fabric_gsm && `${item.fabric_gsm} GSM`}
                </div>
              )}
              {item.notes && (
                <div className="text-xs text-muted-foreground truncate">
                  {item.notes}
                </div>
              )}
            </div>
          ))}
          {items.length > 2 && (
            <div className="text-xs text-muted-foreground">
              +{items.length - 2} more items
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        {totalQuantity ? `${totalQuantity.total} ${totalQuantity.uom}` : '-'}
      </TableCell>
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
  const [totalQuantityByPoId, setTotalQuantityByPoId] = useState<Record<string, { total: number; uom: string }>>({});
  const [itemsByPoId, setItemsByPoId] = useState<Record<string, ItemRowLite[]>>({});
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
          items:purchase_order_items(
            po_id, 
            item_image_url, 
            remarks, 
            quantity, 
            unit_of_measure, 
            item_name, 
            item_type, 
            fabric_name, 
            fabric_color, 
            fabric_gsm, 
            notes,
            item_id
          )
        `)
        .order('created_at', { ascending: false });
      
      if (poErr) throw poErr;

      console.log('Raw PO data from database:', poData);
      console.log('Number of POs fetched:', poData?.length || 0);
      
      // Log detailed PO information for debugging
      if (poData && poData.length > 0) {
        console.log('Detailed PO data:');
        poData.forEach((po: any, index: number) => {
          console.log(`PO ${index + 1}:`, {
            id: po.id,
            po_number: po.po_number,
            bom_id: po.bom_id,
            supplier_id: po.supplier_id,
            status: po.status,
            created_at: po.created_at,
            supplier: po.supplier,
            items_count: po.items?.length || 0
          });
        });
      }

      // Process the joined data
      const supplierMap: Record<string, Supplier> = {};
      const firstImageMap: Record<string, string | null> = {};
      const totalQuantityMap: Record<string, { total: number; uom: string }> = {};
      const itemsMap: Record<string, ItemRowLite[]> = {};
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
          let totalQty = 0;
          let primaryUom = '';
          
          // Store all items for this PO
          itemsMap[po.id] = po.items;
          
          po.items.forEach((item: ItemRowLite) => {
            // Pick first non-null image only
            if (firstImageMap[item.po_id] == null && item.item_image_url) {
              firstImageMap[item.po_id] = item.item_image_url;
            }
            
            // Calculate total quantity
            totalQty += item.quantity || 0;
            if (!primaryUom && item.unit_of_measure) {
              primaryUom = item.unit_of_measure;
            }
          });
          
          totalQuantityMap[po.id] = {
            total: totalQty,
            uom: primaryUom || 'pcs'
          };
        }

        // Process PO data - no pricing calculations needed
        const processedPO: PurchaseOrder = {
          id: po.id,
          po_number: po.po_number,
          supplier_id: po.supplier_id,
          order_date: po.order_date,
          expected_delivery_date: po.expected_delivery_date,
          subtotal: po.subtotal,
          tax_amount: po.tax_amount,
          total_amount: po.total_amount, // Keep as is, no calculations
          status: po.status,
          created_at: po.created_at
        };
        processedPOs.push(processedPO);
      });

      console.log('Processed POs:', processedPOs);
      console.log('Supplier map:', supplierMap);
      console.log('First image map:', firstImageMap);
      console.log('Total quantity map:', totalQuantityMap);

      setPurchaseOrders(processedPOs);
      setSuppliers(supplierMap);
      setFirstItemImageByPoId(firstImageMap);
      setTotalQuantityByPoId(totalQuantityMap);
      setItemsByPoId(itemsMap);
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
                    <TableHead>Item Details</TableHead>
                    <TableHead>Total Qty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPOs.map((po) => {
                    const sup = suppliers[po.supplier_id];
                    const img = firstItemImageByPoId[po.id];
                    const totalQty = totalQuantityByPoId[po.id];
                    const items = itemsByPoId[po.id] || [];
                    return (
                      <PurchaseOrderRow
                        key={po.id}
                        po={po}
                        supplier={sup}
                        imageUrl={img}
                        totalQuantity={totalQty}
                        items={items}
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


