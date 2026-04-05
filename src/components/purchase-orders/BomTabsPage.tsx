import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Eye, Search, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatCurrency } from '@/lib/utils';
import { calculateOrderSummary } from '@/utils/priceCalculation';

// Import existing BomList component
import { BomList } from './BomList';
import { BomOrderLinePicker } from './BomOrderLinePicker';
import '../../pages/OrdersPageViewSwitch.css';

type BomRowRef = { order_id: string; order_item_id: string | null };

/** Legacy: BOM with null order_item_id covers the whole order for eligibility. */
function getOrderBomCoverage(orderId: string, bomRows: BomRowRef[]) {
  const forOrder = bomRows.filter(b => b.order_id === orderId);
  const hasLegacyFullOrderBom = forOrder.some(b => b.order_item_id == null);
  const coveredItemIds = new Set(
    forOrder.map(b => b.order_item_id).filter(Boolean) as string[]
  );
  return { hasLegacyFullOrderBom, coveredItemIds };
}

function orderHasLineMissingBom(order: { id: string; order_items?: { id: string }[] }, bomRows: BomRowRef[]) {
  const { hasLegacyFullOrderBom, coveredItemIds } = getOrderBomCoverage(order.id, bomRows);
  if (hasLegacyFullOrderBom) return false;
  const itemIds = (order.order_items || []).map(i => i.id).filter(Boolean);
  if (itemIds.length === 0) return false;
  return itemIds.some(id => !coveredItemIds.has(id));
}

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  /** Expected delivery from `orders.expected_delivery_date` */
  expected_delivery_date?: string | null;
  /** Legacy / alternate column if present */
  delivery_date?: string | null;
  status: string;
  total_amount: number;
  final_amount: number;
  advance_amount?: number;
  total_receipts?: number;
  pending_amount?: number;
  calculatedAmount?: number;
  gst_rate?: number;
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
  product_description?: string | null;
  category_image_url?: string | null;
  created_at?: string | null;
}

interface OrdersWithoutBomProps {
  onOpenLinePicker: (orderId: string) => void;
  refreshTrigger?: number;
}

function OrdersWithoutBom({ onOpenLinePicker, refreshTrigger }: OrdersWithoutBomProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [bomRows, setBomRows] = useState<BomRowRef[]>([]);
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

  // Removed aggressive visibility refresh to prevent resetting user work

  const fetchOrdersWithoutBom = async () => {
    try {
      setLoading(true);
      
      const { data: bomRecords, error: bomError } = await supabase
        .from('bom_records')
        .select('order_id, order_item_id');
      
      if (bomError) throw bomError;
      const bomList = (bomRecords || []) as BomRowRef[];
      setBomRows(bomList);
      
      // Get all receipts linked to orders with amounts
      const { data: receiptRecords, error: receiptError } = await supabase
        .from('receipts')
        .select('reference_id, reference_number, reference_type, amount')
        .eq('reference_type', 'order' as any);
      
      if (receiptError) throw receiptError;
      
      console.log('All receipt records:', receiptRecords);
      
      // Create a map to store total receipts per order (by both ID and number)
      const orderReceiptTotals = new Map<string, number>();
      
      // Process receipts and sum amounts by order
      (receiptRecords || []).forEach((receipt: any) => {
        const amount = Number(receipt.amount) || 0;
        
        // Add to total by order ID
        if (receipt.reference_id) {
          const currentTotal = orderReceiptTotals.get(receipt.reference_id) || 0;
          orderReceiptTotals.set(receipt.reference_id, currentTotal + amount);
        }
        
        // Add to total by order number (only if different from ID to avoid double counting)
        if (receipt.reference_number && receipt.reference_number !== receipt.reference_id) {
          const currentTotal = orderReceiptTotals.get(receipt.reference_number) || 0;
          orderReceiptTotals.set(receipt.reference_number, currentTotal + amount);
        }
      });
      
      console.log('Order receipt totals:', Object.fromEntries(orderReceiptTotals));
      
      // Create sets for orders that have receipts
      const ordersWithReceiptsById = new Set((receiptRecords || []).map((receipt: any) => receipt.reference_id));
      const ordersWithReceiptsByNumber = new Set((receiptRecords || []).map((receipt: any) => receipt.reference_number));
      
      console.log('Orders with receipts (by ID):', Array.from(ordersWithReceiptsById));
      console.log('Orders with receipts (by Number):', Array.from(ordersWithReceiptsByNumber));
      
      // Get all orders that are not cancelled (including pending orders) - exclude readymade orders (they don't need BOMs)
      const { data: allOrdersRaw, error: ordersError } = await supabase
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
            product_description,
            category_image_url,
            created_at
          )
        `)
        .not('status', 'eq', 'cancelled')
        .order('order_date', { ascending: false });

      if (ordersError) throw ordersError;

      const allOrders = (allOrdersRaw || []).filter(
        (o: any) => !o.order_type || o.order_type === 'custom'
      );
      
      console.log('All orders fetched:', allOrders?.length || 0);
      console.log('Sample order:', allOrders?.[0]);
      
      // Filter orders that have receipts and at least one order line without a BOM
      // (legacy: any bom_records row with null order_item_id counts as full-order BOM)
      const eligibleOrders = (allOrders || []).filter((order: any) => {
        const hasReceiptById = ordersWithReceiptsById.has(order.id);
        const hasReceiptByNumber = ordersWithReceiptsByNumber.has(order.order_number);
        const hasReceipt = hasReceiptById || hasReceiptByNumber;
        const needsBom = orderHasLineMissingBom(order, bomList);
        console.log(`Order ${order.order_number} (${order.id}): hasReceipt=${hasReceipt}, needsLineBom=${needsBom}, status=${order.status}`);
        return hasReceipt && needsBom;
      });
      
      // Calculate correct amounts using size-based pricing for each order
      const ordersWithCalculatedAmounts = await Promise.all(
        eligibleOrders.map(async (order: any) => {
          try {
            // Fetch order items with size_prices and sizes_quantities
            const { data: orderItems, error: itemsError } = await supabase
              .from('order_items')
              .select('id, unit_price, quantity, size_prices, sizes_quantities, specifications, gst_rate')
              .eq('order_id', order.id);

            if (!itemsError && orderItems && orderItems.length > 0) {
              // Calculate the correct total using size-based pricing
              const { grandTotal } = calculateOrderSummary(orderItems, order);
              
              // Calculate pending amount (grandTotal - total receipts)
              const totalReceipts = orderReceiptTotals.get(order.id) || orderReceiptTotals.get(order.order_number) || 0;
              const pendingAmount = Math.max(0, grandTotal - totalReceipts);
              
              return {
                ...order,
                calculatedAmount: grandTotal,
                pending_amount: pendingAmount
              };
            } else {
              // Fallback to final_amount if no items found
              const totalReceipts = orderReceiptTotals.get(order.id) || orderReceiptTotals.get(order.order_number) || 0;
              const pendingAmount = Math.max(0, (order.final_amount || 0) - totalReceipts);
              
              return {
                ...order,
                calculatedAmount: order.final_amount,
                pending_amount: pendingAmount
              };
            }
          } catch (error) {
            console.error(`Error calculating amount for order ${order.order_number}:`, error);
            const totalReceipts = orderReceiptTotals.get(order.id) || orderReceiptTotals.get(order.order_number) || 0;
            const pendingAmount = Math.max(0, (order.final_amount || 0) - totalReceipts);
            
            return {
              ...order,
              calculatedAmount: order.final_amount,
              pending_amount: pendingAmount
            };
          }
        })
      );
      
      console.log('Eligible orders (with receipts, without BOMs):', ordersWithCalculatedAmounts.length);
      console.log('Eligible orders details:', ordersWithCalculatedAmounts);
      
      setOrders(ordersWithCalculatedAmounts as unknown as Order[]);
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
      order.order_items?.some(item => {
        const desc = item.product_description || '';
        return desc.toLowerCase().includes(term);
      })
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
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Orders</p>
                <p className="text-2xl font-bold">{filteredOrders.length}</p>
              </div>
              <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 text-sm font-bold">{filteredOrders.length}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
                      product_description,
                      category_image_url
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
                  <TableHead>Status</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Delivery Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow
                    key={order.id}
                    className="hover:bg-muted/50 cursor-pointer"
                    onClick={() => onOpenLinePicker(order.id)}
                  >
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
                      <div className="space-y-2 max-w-md">
                        {(() => {
                          const { hasLegacyFullOrderBom, coveredItemIds } = getOrderBomCoverage(order.id, bomRows);
                          return (order.order_items || []).map((item) => {
                            const lineLabel = item.product_description || 'Product';
                            const hasLineBom = hasLegacyFullOrderBom || coveredItemIds.has(item.id);
                            const lineThumb = (item as any).category_image_url;
                            return (
                              <div
                                key={item.id}
                                className="flex flex-wrap items-center gap-2 border-b border-border/50 pb-2 last:border-0 last:pb-0"
                              >
                                {lineThumb && (
                                  <img
                                    src={lineThumb}
                                    alt={lineLabel}
                                    className="w-6 h-6 rounded object-cover shrink-0"
                                  />
                                )}
                                <span className="text-sm flex-1 min-w-0">
                                  {lineLabel}{' '}
                                  <span className="text-muted-foreground">({item.quantity} pcs)</span>
                                </span>
                                {hasLineBom ? (
                                  <Badge variant="secondary" className="shrink-0">
                                    BOM
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="shrink-0 text-xs">
                                    Pending
                                  </Badge>
                                )}
                              </div>
                            );
                          });
                        })()}
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
                      {(() => {
                        const raw =
                          order.expected_delivery_date ?? order.delivery_date;
                        if (!raw) return '-';
                        const d = new Date(raw);
                        return Number.isNaN(d.getTime())
                          ? '-'
                          : d.toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: '2-digit',
                            });
                      })()}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        title="View order"
                        onClick={() => window.open(`/orders/${order.id}`, '_blank')}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
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
    </div>
  );
}

export function BomTabsPage() {
  const navigate = useNavigate();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const pickOrder = searchParams.get('pickOrder');

  // Refresh when component mounts (user returns from BOM creation)
  useEffect(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const openLinePicker = (orderId: string) => {
    navigate(`/bom?tab=create-bom&pickOrder=${encodeURIComponent(orderId)}`, { replace: true });
  };

  const closeLinePicker = () => {
    navigate('/bom?tab=create-bom', { replace: true });
  };

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const activeBomTab = tabFromUrl === 'view-bom' ? 'view-bom' : 'create-bom';

  const setBomTab = (tab: 'create-bom' | 'view-bom') => {
    navigate(`/bom?tab=${tab}`, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Bills of Material</h2>
          <p className="text-muted-foreground">Manage and create Bills of Material for orders</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh}>
            <Search className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <div className="border rounded-lg p-4">
        <div className="mb-6 flex justify-start">
          <label
            htmlFor="bom-page-view-switch"
            className="orders-view-switch"
            aria-label="Switch between creating a BOM and viewing existing BOMs"
          >
            <input
              id="bom-page-view-switch"
              type="checkbox"
              role="switch"
              aria-checked={activeBomTab === 'view-bom'}
              checked={activeBomTab === 'view-bom'}
              onChange={(e) => setBomTab(e.target.checked ? 'view-bom' : 'create-bom')}
            />
            <span>Create BOM</span>
            <span>View BOMs</span>
          </label>
        </div>

        {activeBomTab === 'create-bom' && (
          <div className="space-y-4">
            {pickOrder ? (
              <BomOrderLinePicker orderId={pickOrder} onBack={closeLinePicker} />
            ) : (
              <OrdersWithoutBom onOpenLinePicker={openLinePicker} refreshTrigger={refreshTrigger} />
            )}
          </div>
        )}

        {activeBomTab === 'view-bom' && (
          <div className="space-y-4">
            <div className="p-4 border rounded-lg">
              <h3 className="text-lg font-semibold mb-4">Existing BOMs</h3>
              <BomList refreshTrigger={refreshTrigger} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
