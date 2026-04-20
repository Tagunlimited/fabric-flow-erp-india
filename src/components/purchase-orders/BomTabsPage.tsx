import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Eye, Search, Package, FileText, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BomOrderLinePicker } from './BomOrderLinePicker';
import '../../pages/OrdersPageViewSwitch.css';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type BomRowRef = { id: string; order_id: string; order_item_id: string | null };

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

/** Every line has a BOM (or legacy whole-order BOM). Orders with no lines are excluded. */
function orderFullyCoveredByBom(order: { id: string; order_items?: { id: string }[] }, bomRows: BomRowRef[]) {
  const { hasLegacyFullOrderBom, coveredItemIds } = getOrderBomCoverage(order.id, bomRows);
  if (hasLegacyFullOrderBom) return true;
  const itemIds = (order.order_items || []).map(i => i.id).filter(Boolean);
  if (itemIds.length === 0) return false;
  return itemIds.every(id => coveredItemIds.has(id));
}

/** Completed orders are treated as closed for BOM workflow (e.g. manual status without BOM rows). */
function isOrderStatusCompleted(order: { status: string }) {
  return order.status === 'completed';
}

/** Closed BOM workflow statuses: completed or dispatched. */
function isOrderStatusClosedForBom(order: { status: string }) {
  return order.status === 'completed' || order.status === 'dispatched';
}

function getBomIdForLine(orderId: string, orderItemId: string, bomRows: BomRowRef[]): string | null {
  const forOrder = bomRows.filter(b => b.order_id === orderId);
  const legacy = forOrder.find(b => b.order_item_id == null);
  if (legacy) return legacy.id;
  return forOrder.find(b => b.order_item_id === orderItemId)?.id ?? null;
}

async function fetchCustomOrdersWithBomRefs(): Promise<{ orders: Order[]; bomRows: BomRowRef[] }> {
  const { data: bomRecords, error: bomError } = await supabase
    .from('bom_records')
    .select('id, order_id, order_item_id')
    .eq('is_deleted', false);

  if (bomError) throw bomError;
  const bomList = (bomRecords || []) as BomRowRef[];

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
    .eq('is_deleted', false)
    .not('status', 'eq', 'cancelled')
    .order('order_date', { ascending: false });

  if (ordersError) throw ordersError;

  const allOrders = (allOrdersRaw || [])
    .filter((o: any) => !o.order_type || o.order_type === 'custom')
    .map((o: any) => ({
      ...o,
      order_items: (o.order_items || []).filter((it: any) => it?.is_deleted !== true),
    })) as unknown as Order[];

  return { orders: allOrders, bomRows: bomList };
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

type BomColumnFilters = {
  order_number: string;
  customer: string;
  products: string;
  status: string;
  order_date: string;
  delivery_date: string;
};

const EMPTY_BOM_COLUMN_FILTERS: BomColumnFilters = {
  order_number: '',
  customer: '',
  products: '',
  status: '',
  order_date: '',
  delivery_date: '',
};

type BomFilterColumnKey = keyof BomColumnFilters;

const BOM_FILTER_DIALOG_META: Record<
  BomFilterColumnKey,
  { title: string; description: string; placeholder: string }
> = {
  order_number: {
    title: 'Filter by order #',
    description: 'Match order number text.',
    placeholder: 'e.g. TUC/26-',
  },
  customer: {
    title: 'Filter by customer',
    description: 'Match customer/company/contact text.',
    placeholder: 'e.g. Rajiv',
  },
  products: {
    title: 'Filter by products',
    description: 'Match line product description or quantity text.',
    placeholder: 'e.g. Product or 11 pcs',
  },
  status: {
    title: 'Filter by status',
    description: 'Match order status text.',
    placeholder: 'e.g. confirmed',
  },
  order_date: {
    title: 'Filter by order date',
    description: 'Match visible order date text.',
    placeholder: 'e.g. 17 Apr',
  },
  delivery_date: {
    title: 'Filter by delivery date',
    description: 'Match visible delivery date text.',
    placeholder: 'e.g. 22 Apr',
  },
};

function bomColIncludes(filterRaw: string, value: string): boolean {
  const f = filterRaw.trim().toLowerCase();
  if (!f) return true;
  return value.toLowerCase().includes(f);
}

function BomColumnFilterTrigger({
  active,
  ariaLabel,
  onOpen,
}: {
  active: boolean;
  ariaLabel: string;
  onOpen: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={ariaLabel}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={
        active
          ? 'h-7 w-7 shrink-0 rounded-full bg-primary/20 text-primary ring-2 ring-primary/50 ring-offset-2 ring-offset-background hover:bg-primary/28'
          : 'h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted/80 hover:text-foreground'
      }
    >
      <Filter className={active ? 'h-3.5 w-3.5 scale-110 fill-primary' : 'h-3.5 w-3.5'} strokeWidth={active ? 2.5 : 2} />
    </Button>
  );
}

function OrdersWithoutBom({ onOpenLinePicker, refreshTrigger }: OrdersWithoutBomProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [bomRows, setBomRows] = useState<BomRowRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [columnFilters, setColumnFilters] = useState<BomColumnFilters>({ ...EMPTY_BOM_COLUMN_FILTERS });
  const [filterDialogColumn, setFilterDialogColumn] = useState<BomFilterColumnKey | null>(null);
  const hasActiveColumnFilters = Object.values(columnFilters).some((v) => v.trim().length > 0);
  const filterDialogMeta = filterDialogColumn ? BOM_FILTER_DIALOG_META[filterDialogColumn] : null;

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
      const { orders: allOrders, bomRows: bomList } = await fetchCustomOrdersWithBomRefs();
      setBomRows(bomList);

      const eligibleOrders = allOrders.filter((order) => {
        const itemCount = (order.order_items || []).length;
        if (itemCount === 0) return false;
        if (isOrderStatusClosedForBom(order)) return false;
        return orderHasLineMissingBom(order, bomList);
      });

      setOrders(eligibleOrders);
    } catch (error) {
      console.error('Error fetching orders pending BOM:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter(order => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        order.order_number?.toLowerCase().includes(term) ||
        order.customer?.company_name?.toLowerCase().includes(term) ||
        order.customer?.contact_person?.toLowerCase().includes(term) ||
        order.order_items?.some(item => {
          const desc = item.product_description || '';
          return desc.toLowerCase().includes(term);
        });
      if (!matchesSearch) return false;
    }
    const productsHay = (order.order_items || [])
      .map((item) => `${item.product_description || 'Product'} ${item.quantity || 0} pcs`)
      .join(' ');
    const orderDateText = order.order_date
      ? new Date(order.order_date).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: '2-digit',
        })
      : '';
    const deliveryRaw = order.expected_delivery_date ?? order.delivery_date;
    const deliveryDateText = deliveryRaw
      ? (() => {
          const d = new Date(deliveryRaw);
          return Number.isNaN(d.getTime())
            ? '-'
            : d.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: '2-digit',
              });
        })()
      : '-';
    return (
      bomColIncludes(columnFilters.order_number, order.order_number || '') &&
      bomColIncludes(
        columnFilters.customer,
        `${order.customer?.company_name || ''} ${order.customer?.contact_person || ''}`
      ) &&
      bomColIncludes(columnFilters.products, productsHay) &&
      bomColIncludes(columnFilters.status, order.status || '') &&
      bomColIncludes(columnFilters.order_date, orderDateText) &&
      bomColIncludes(columnFilters.delivery_date, deliveryDateText)
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
    <div className="h-full min-h-0">
      <Card className="h-full min-h-0 flex flex-col">
        <CardHeader>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Orders pending BOM ({orders.length})
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
            {hasActiveColumnFilters && (
              <Button variant="outline" size="sm" onClick={() => setColumnFilters({ ...EMPTY_BOM_COLUMN_FILTERS })}>
                Clear column filters
              </Button>
            )}
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
      <CardContent className="min-h-0 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
              <Table>
              <TableHeader className="sticky top-0 z-20 bg-background">
                <TableRow>
                  <TableHead className="sticky top-0 z-20 bg-background">
                    <div className="flex items-center gap-1">Order #<BomColumnFilterTrigger active={!!columnFilters.order_number.trim()} ariaLabel="Filter order number" onOpen={() => setFilterDialogColumn('order_number')} /></div>
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">
                    <div className="flex items-center gap-1">Customer<BomColumnFilterTrigger active={!!columnFilters.customer.trim()} ariaLabel="Filter customer" onOpen={() => setFilterDialogColumn('customer')} /></div>
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">
                    <div className="flex items-center gap-1">Products<BomColumnFilterTrigger active={!!columnFilters.products.trim()} ariaLabel="Filter products" onOpen={() => setFilterDialogColumn('products')} /></div>
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">
                    <div className="flex items-center gap-1">Status<BomColumnFilterTrigger active={!!columnFilters.status.trim()} ariaLabel="Filter status" onOpen={() => setFilterDialogColumn('status')} /></div>
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">
                    <div className="flex items-center gap-1">Order Date<BomColumnFilterTrigger active={!!columnFilters.order_date.trim()} ariaLabel="Filter order date" onOpen={() => setFilterDialogColumn('order_date')} /></div>
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">
                    <div className="flex items-center gap-1">Delivery Date<BomColumnFilterTrigger active={!!columnFilters.delivery_date.trim()} ariaLabel="Filter delivery date" onOpen={() => setFilterDialogColumn('delivery_date')} /></div>
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">Actions</TableHead>
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
                {searchTerm ? 'No orders found matching your search.' : 'No custom orders are missing a BOM on any line.'}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
    <Dialog
      open={filterDialogColumn !== null}
      onOpenChange={(open) => {
        if (!open) setFilterDialogColumn(null);
      }}
    >
      <DialogContent className="sm:max-w-md">
        {filterDialogColumn && filterDialogMeta && (
          <>
            <DialogHeader>
              <DialogTitle>{filterDialogMeta.title}</DialogTitle>
              <DialogDescription>{filterDialogMeta.description}</DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              placeholder={filterDialogMeta.placeholder}
              value={columnFilters[filterDialogColumn]}
              onChange={(e) =>
                setColumnFilters((p) => ({ ...p, [filterDialogColumn]: e.target.value }))
              }
            />
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setColumnFilters((p) => ({ ...p, [filterDialogColumn]: '' }))}
              >
                Clear this filter
              </Button>
              <Button type="button" onClick={() => setFilterDialogColumn(null)}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
    </div>
  );
}

interface OrdersCompleteBomProps {
  refreshTrigger?: number;
}

/** Custom orders with full BOM coverage, or marked completed (BOM workflow closed). */
function OrdersCompleteBom({ refreshTrigger }: OrdersCompleteBomProps) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [bomRows, setBomRows] = useState<BomRowRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [columnFilters, setColumnFilters] = useState<BomColumnFilters>({ ...EMPTY_BOM_COLUMN_FILTERS });
  const [filterDialogColumn, setFilterDialogColumn] = useState<BomFilterColumnKey | null>(null);
  const hasActiveColumnFilters = Object.values(columnFilters).some((v) => v.trim().length > 0);
  const filterDialogMeta = filterDialogColumn ? BOM_FILTER_DIALOG_META[filterDialogColumn] : null;

  useEffect(() => {
    void fetchOrdersCompleteBom();
  }, []);

  useEffect(() => {
    if (refreshTrigger) {
      void fetchOrdersCompleteBom();
    }
  }, [refreshTrigger]);

  const fetchOrdersCompleteBom = async () => {
    try {
      setLoading(true);
      const { orders: allOrders, bomRows: bomList } = await fetchCustomOrdersWithBomRefs();
      setBomRows(bomList);

      const eligible = allOrders.filter((order) => {
        const itemCount = (order.order_items || []).length;
        if (itemCount === 0) return false;
        return orderFullyCoveredByBom(order, bomList) || isOrderStatusClosedForBom(order);
      });

      setOrders(eligible);
    } catch (error) {
      console.error('Error fetching orders with complete BOM:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter((order) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        order.order_number?.toLowerCase().includes(term) ||
        order.customer?.company_name?.toLowerCase().includes(term) ||
        order.customer?.contact_person?.toLowerCase().includes(term) ||
        order.order_items?.some((item) => {
          const desc = item.product_description || '';
          return desc.toLowerCase().includes(term);
        });
      if (!matchesSearch) return false;
    }
    const productsHay = (order.order_items || [])
      .map((item) => `${item.product_description || 'Product'} ${item.quantity || 0} pcs`)
      .join(' ');
    const orderDateText = order.order_date
      ? new Date(order.order_date).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: '2-digit',
        })
      : '';
    const deliveryRaw = order.expected_delivery_date ?? order.delivery_date;
    const deliveryDateText = deliveryRaw
      ? (() => {
          const d = new Date(deliveryRaw);
          return Number.isNaN(d.getTime())
            ? '-'
            : d.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: '2-digit',
              });
        })()
      : '-';
    return (
      bomColIncludes(columnFilters.order_number, order.order_number || '') &&
      bomColIncludes(
        columnFilters.customer,
        `${order.customer?.company_name || ''} ${order.customer?.contact_person || ''}`
      ) &&
      bomColIncludes(columnFilters.products, productsHay) &&
      bomColIncludes(columnFilters.status, order.status || '') &&
      bomColIncludes(columnFilters.order_date, orderDateText) &&
      bomColIncludes(columnFilters.delivery_date, deliveryDateText)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'confirmed':
        return 'bg-blue-100 text-blue-800';
      case 'in_production':
        return 'bg-purple-100 text-purple-800';
      case 'quality_check':
        return 'bg-orange-100 text-orange-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col gap-4">
      <Card className="min-h-0 flex-1 flex flex-col">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              BOM complete or order closed ({orders.length})
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
              <Button variant="outline" size="sm" onClick={() => void fetchOrdersCompleteBom()}>
                Refresh
              </Button>
              {hasActiveColumnFilters && (
                <Button variant="outline" size="sm" onClick={() => setColumnFilters({ ...EMPTY_BOM_COLUMN_FILTERS })}>
                  Clear column filters
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="h-full overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-20 bg-background">
                  <TableRow>
                    <TableHead className="sticky top-0 z-20 bg-background">
                      <div className="flex items-center gap-1">Order #<BomColumnFilterTrigger active={!!columnFilters.order_number.trim()} ariaLabel="Filter order number" onOpen={() => setFilterDialogColumn('order_number')} /></div>
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">
                      <div className="flex items-center gap-1">Customer<BomColumnFilterTrigger active={!!columnFilters.customer.trim()} ariaLabel="Filter customer" onOpen={() => setFilterDialogColumn('customer')} /></div>
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">
                      <div className="flex items-center gap-1">Products<BomColumnFilterTrigger active={!!columnFilters.products.trim()} ariaLabel="Filter products" onOpen={() => setFilterDialogColumn('products')} /></div>
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">
                      <div className="flex items-center gap-1">Status<BomColumnFilterTrigger active={!!columnFilters.status.trim()} ariaLabel="Filter status" onOpen={() => setFilterDialogColumn('status')} /></div>
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">
                      <div className="flex items-center gap-1">Order Date<BomColumnFilterTrigger active={!!columnFilters.order_date.trim()} ariaLabel="Filter order date" onOpen={() => setFilterDialogColumn('order_date')} /></div>
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">
                      <div className="flex items-center gap-1">Delivery Date<BomColumnFilterTrigger active={!!columnFilters.delivery_date.trim()} ariaLabel="Filter delivery date" onOpen={() => setFilterDialogColumn('delivery_date')} /></div>
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow
                      key={order.id}
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/orders/${order.id}`)}
                    >
                      <TableCell className="font-medium">{order.order_number}</TableCell>
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
                            const { hasLegacyFullOrderBom, coveredItemIds } = getOrderBomCoverage(
                              order.id,
                              bomRows
                            );
                            return (order.order_items || []).map((item) => {
                              const lineLabel = item.product_description || 'Product';
                              const lineThumb = (item as any).category_image_url;
                              const hasLineBom = hasLegacyFullOrderBom || coveredItemIds.has(item.id);
                              const bomId = hasLineBom
                                ? getBomIdForLine(order.id, item.id, bomRows)
                                : null;
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
                                    <>
                                      <Badge variant="secondary" className="shrink-0">
                                        BOM
                                      </Badge>
                                      {bomId && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 px-2 shrink-0"
                                          title="Open BOM"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/bom/${bomId}`);
                                          }}
                                        >
                                          <FileText className="w-4 h-4" />
                                        </Button>
                                      )}
                                    </>
                                  ) : (
                                    <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
                                      No BOM record
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
                          year: '2-digit',
                        })}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const raw = order.expected_delivery_date ?? order.delivery_date;
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
                  {searchTerm
                    ? 'No orders found matching your search.'
                    : 'No custom orders are fully covered by BOM or marked complete.'}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={filterDialogColumn !== null}
        onOpenChange={(open) => {
          if (!open) setFilterDialogColumn(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {filterDialogColumn && filterDialogMeta && (
            <>
              <DialogHeader>
                <DialogTitle>{filterDialogMeta.title}</DialogTitle>
                <DialogDescription>{filterDialogMeta.description}</DialogDescription>
              </DialogHeader>
              <Input
                autoFocus
                placeholder={filterDialogMeta.placeholder}
                value={columnFilters[filterDialogColumn]}
                onChange={(e) =>
                  setColumnFilters((p) => ({ ...p, [filterDialogColumn]: e.target.value }))
                }
              />
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setColumnFilters((p) => ({ ...p, [filterDialogColumn]: '' }))}
                >
                  Clear this filter
                </Button>
                <Button type="button" onClick={() => setFilterDialogColumn(null)}>
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
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
    navigate(`/bom?tab=pending&pickOrder=${encodeURIComponent(orderId)}`, { replace: true });
  };

  const closeLinePicker = () => {
    navigate('/bom?tab=pending', { replace: true });
  };

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  /** Legacy URLs: create-bom / view-bom */
  const activeBomTab: 'pending' | 'complete' =
    tabFromUrl === 'view-bom' || tabFromUrl === 'complete' ? 'complete' : 'pending';

  const setBomTab = (tab: 'pending' | 'complete') => {
    navigate(`/bom?tab=${tab}`, { replace: true });
  };

  return (
    <div className="space-y-6 h-[calc(100vh-11rem)] min-h-0 flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Bills of Material</h2>
          <p className="text-muted-foreground">
            Pending: orders still in progress that are missing a BOM on at least one line. Complete: every line has
            a BOM, or the order is marked completed/dispatched.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh}>
            <Search className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <div className="border rounded-lg p-4 flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="mb-4 flex justify-start sticky top-0 z-20 bg-background pb-2">
          <label
            htmlFor="bom-page-view-switch"
            className="orders-view-switch"
            aria-label="Switch between pending BOM work and complete BOMs"
          >
            <input
              id="bom-page-view-switch"
              type="checkbox"
              role="switch"
              aria-checked={activeBomTab === 'complete'}
              checked={activeBomTab === 'complete'}
              onChange={(e) => setBomTab(e.target.checked ? 'complete' : 'pending')}
            />
            <span>Pending</span>
            <span>Complete</span>
          </label>
        </div>

        {activeBomTab === 'pending' && (
          <div className="min-h-0 flex-1">
            {pickOrder ? (
              <BomOrderLinePicker orderId={pickOrder} onBack={closeLinePicker} />
            ) : (
              <OrdersWithoutBom onOpenLinePicker={openLinePicker} refreshTrigger={refreshTrigger} />
            )}
          </div>
        )}

        {activeBomTab === 'complete' && (
          <div className="min-h-0 flex-1">
            <OrdersCompleteBom refreshTrigger={refreshTrigger} />
          </div>
        )}
      </div>
    </div>
  );
}
