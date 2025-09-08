import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, Search, Plus, FileText, Calendar, User, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/lib/utils';

// Import existing BomList component
import { BomList } from './BomList';

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  delivery_date?: string;
  status: string;
  total_amount: number;
  final_amount: number;
  advance_amount?: number;
  customer: {
    company_name: string;
    contact_person?: string;
  };
  order_items: OrderItem[];
}

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  product: {
    name: string;
    code: string;
    category: string;
    image_url?: string;
  };
}

interface OrdersWithoutBomProps {
  onCreateBom: (orderId: string) => void;
  refreshTrigger?: number;
}

function OrdersWithoutBom({ onCreateBom, refreshTrigger }: OrdersWithoutBomProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchOrdersWithoutBom();
  }, []);

  // Refresh when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger) {
      fetchOrdersWithoutBom();
    }
  }, [refreshTrigger]);

  // Refresh when component becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchOrdersWithoutBom();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const fetchOrdersWithoutBom = async () => {
    try {
      setLoading(true);
      
      // First, get all order IDs that have BOMs
      const { data: bomRecords, error: bomError } = await supabase
        .from('bom_records')
        .select('order_id');
      
      if (bomError) throw bomError;
      
      const ordersWithBom = new Set((bomRecords || []).map((bom: any) => bom.order_id));
      console.log('Orders with BOMs:', Array.from(ordersWithBom));
      
      // Get all receipts linked to orders
      const { data: receiptRecords, error: receiptError } = await supabase
        .from('receipts')
        .select('reference_id, reference_number, reference_type')
        .eq('reference_type', 'order' as any);
      
      if (receiptError) throw receiptError;
      
      console.log('All receipt records:', receiptRecords);
      
      // Create sets for both reference_id and reference_number matching
      const ordersWithReceiptsById = new Set((receiptRecords || []).map((receipt: any) => receipt.reference_id));
      const ordersWithReceiptsByNumber = new Set((receiptRecords || []).map((receipt: any) => receipt.reference_number));
      
      console.log('Orders with receipts (by ID):', Array.from(ordersWithReceiptsById));
      console.log('Orders with receipts (by Number):', Array.from(ordersWithReceiptsByNumber));
      
      // Get all orders that are not cancelled (including pending orders)
      const { data: allOrders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(company_name, contact_person),
          order_items(
            id,
            product_id,
            quantity,
            unit_price,
            total_price,
            product:products(name, code, category)
          )
        `)
        .not('status', 'eq', 'cancelled')
        .order('order_date', { ascending: false });
      
      if (ordersError) throw ordersError;
      
      console.log('All orders fetched:', allOrders?.length || 0);
      console.log('Sample order:', allOrders?.[0]);
      
      // Filter orders that:
      // 1. Have receipts (are paid) - check both ID and number matching
      // 2. Do NOT have BOMs
      const eligibleOrders = (allOrders || []).filter((order: any) => {
        const hasReceiptById = ordersWithReceiptsById.has(order.id);
        const hasReceiptByNumber = ordersWithReceiptsByNumber.has(order.order_number);
        const hasReceipt = hasReceiptById || hasReceiptByNumber;
        const hasBom = ordersWithBom.has(order.id);
        console.log(`Order ${order.order_number} (${order.id}): hasReceiptById=${hasReceiptById}, hasReceiptByNumber=${hasReceiptByNumber}, hasReceipt=${hasReceipt}, hasBom=${hasBom}, status=${order.status}`);
        return hasReceipt && !hasBom;
      });
      
      console.log('Eligible orders (with receipts, without BOMs):', eligibleOrders.length);
      console.log('Eligible orders details:', eligibleOrders);
      
      // Check specifically for the order from the image
      const targetOrder = (allOrders || []).find((order: any) => order.order_number === 'TUC/25-26/SEP/004');
      if (targetOrder) {
        console.log('Found target order TUC/25-26/SEP/004:', targetOrder);
        const hasReceiptById = ordersWithReceiptsById.has((targetOrder as any).id);
        const hasReceiptByNumber = ordersWithReceiptsByNumber.has((targetOrder as any).order_number);
        console.log('Target order receipt check:', { hasReceiptById, hasReceiptByNumber, orderId: (targetOrder as any).id, orderNumber: (targetOrder as any).order_number });
      } else {
        console.log('Target order TUC/25-26/SEP/004 NOT FOUND in orders');
      }
      
      setOrders(eligibleOrders as unknown as Order[]);
    } catch (error) {
      console.error('Error fetching orders without BOM:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter(order => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      order.order_number?.toLowerCase().includes(term) ||
      order.customer?.company_name?.toLowerCase().includes(term) ||
      order.customer?.contact_person?.toLowerCase().includes(term) ||
      order.order_items?.some(item => 
        item.product?.name?.toLowerCase().includes(term) ||
        item.product?.code?.toLowerCase().includes(term)
      )
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'in_production': return 'bg-purple-100 text-purple-800';
      case 'quality_check': return 'bg-orange-100 text-orange-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Orders with Receipts({orders.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
            <Button variant="outline" size="sm" onClick={fetchOrdersWithoutBom}>
              Refresh
            </Button>
            {/* <Button 
              variant="outline" 
              size="sm" 
              onClick={async () => {
                console.log('=== SHOWING ALL ORDERS (NO FILTERS) ===');
                const { data: allOrders, error } = await supabase
                  .from('orders')
                  .select(`
                    *,
                    customer:customers(company_name, contact_person),
                    order_items(
                      id,
                      product_id,
                      quantity,
                      unit_price,
                      total_price,
                      product:products(name, code, category)
                    )
                  `)
                  .not('status', 'eq', 'cancelled')
                  .order('order_date', { ascending: false });
                
                if (error) {
                  console.error('Error fetching all orders:', error);
                } else {
                  console.log('All orders (no filters):', allOrders);
                  setOrders(allOrders as unknown as Order[]);
                }
              }}
            >
              Show All Orders
            </Button> */}
            {/* <Button 
              variant="outline" 
              size="sm" 
              onClick={async () => {
                console.log('=== DEBUGGING START ===');
                
                // Test 1: Check all orders
                const { data: allOrders, error: ordersError } = await supabase
                  .from('orders')
                  .select('id, order_number, status')
                  .limit(10);
                console.log('1. All orders:', allOrders);
                
                // Test 2: Check all receipts
                const { data: allReceipts, error: receiptsError } = await supabase
                  .from('receipts')
                  .select('reference_id, reference_number, reference_type')
                  .limit(10);
                console.log('2. All receipts:', allReceipts);
                
                // Test 3: Check for specific order
                const { data: specificOrder, error: specificError } = await supabase
                  .from('orders')
                  .select('*')
                  .eq('order_number', 'TUC/25-26/SEP/004');
                console.log('3. Specific order TUC/25-26/SEP/004:', specificOrder);
                
                // Test 4: Check for receipts with this order number
                const { data: specificReceipts, error: specificReceiptError } = await supabase
                  .from('receipts')
                  .select('*')
                  .eq('reference_number', 'TUC/25-26/SEP/004');
                console.log('4. Receipts for TUC/25-26/SEP/004:', specificReceipts);
                
                console.log('=== DEBUGGING END ===');
              }}
            >
              Debug All
            </Button> */}
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
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Delivery Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow key={order.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">
                      {order.order_number}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{order.customer?.company_name}</div>
                        {order.customer?.contact_person && (
                          <div className="text-sm text-muted-foreground">
                            {order.customer.contact_person}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {order.order_items?.slice(0, 2).map((item) => (
                          <div key={item.id} className="flex items-center gap-2">
                            {item.product?.image_url && (
                              <img 
                                src={item.product.image_url} 
                                alt={item.product.name}
                                className="w-6 h-6 rounded object-cover"
                              />
                            )}
                            <span className="text-sm">
                              {item.product?.name} ({item.quantity} pcs)
                            </span>
                          </div>
                        ))}
                        {order.order_items && order.order_items.length > 2 && (
                          <div className="text-xs text-muted-foreground">
                            +{order.order_items.length - 2} more items
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-right">
                        <div className="font-medium">{formatCurrency(order.final_amount || order.total_amount)}</div>
                        {order.advance_amount && order.advance_amount > 0 && (
                          <div className="text-xs text-muted-foreground">
                            Advance: {formatCurrency(order.advance_amount)}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(order.status)}>
                        {order.status.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(order.order_date).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: '2-digit'
                      })}
                    </TableCell>
                    <TableCell>
                      {order.delivery_date ? new Date(order.delivery_date).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: '2-digit'
                      }) : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`/orders/${order.id}`, '_blank')}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => onCreateBom(order.id)}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Create BOM
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredOrders.length === 0 && !loading && (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm ? 'No orders found matching your search.' : 'No orders with receipts found that need BOMs created.'}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function BomTabsPage() {
  const navigate = useNavigate();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleCreateBom = (orderId: string) => {
    navigate(`/procurement/bom/new?order=${orderId}`);
  };

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Bills of Material</h2>
          <p className="text-muted-foreground">Manage and create Bills of Material for orders</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={handleRefresh}
          >
            <Search className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button 
            onClick={() => navigate('/procurement/bom/new')} 
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4 mr-2" /> Create New BOM
          </Button>
        </div>
      </div>

      <div className="border rounded-lg p-4">
        <Tabs defaultValue="create-bom" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6 bg-gray-100">
            <TabsTrigger value="create-bom" className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Plus className="w-4 h-4" />
              Create BOM
            </TabsTrigger>
            <TabsTrigger value="view-bom" className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Eye className="w-4 h-4" />
              View BOMs
            </TabsTrigger>
          </TabsList>
          
        <TabsContent value="create-bom" className="space-y-4">
          <OrdersWithoutBom onCreateBom={handleCreateBom} refreshTrigger={refreshTrigger} />
        </TabsContent>
          
          <TabsContent value="view-bom" className="space-y-4">
            <div className="p-4 border rounded-lg">
              <h3 className="text-lg font-semibold mb-4">Existing BOMs</h3>
              <BomList />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
