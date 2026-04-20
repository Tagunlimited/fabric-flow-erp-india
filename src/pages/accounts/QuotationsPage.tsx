import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErpLayout } from '@/components/ErpLayout';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn, formatCurrency } from '@/lib/utils';
import { getCustomerMobile } from '@/lib/customerContact';
import { Eye, Filter } from 'lucide-react';
import { calculateOrderSummary } from '@/utils/priceCalculation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  customer_id: string;
  customer: { company_name: string; phone?: string | null; mobile?: string | null };
  status: string;
  final_amount: number;
  sales_manager?: string;
  gst_rate?: number;
  calculatedAmount?: number; // Store calculated amount with size-based pricing
}

type QuotationsColumnFilters = {
  order_number: string;
  customer: string;
  mobile: string;
  date: string;
  status: string;
  amount: string;
  sales_manager: string;
};
const EMPTY_COLUMN_FILTERS: QuotationsColumnFilters = {
  order_number: '',
  customer: '',
  mobile: '',
  date: '',
  status: '',
  amount: '',
  sales_manager: '',
};
type QuotationsFilterColumnKey = keyof QuotationsColumnFilters;
const FILTER_META: Record<
  QuotationsFilterColumnKey,
  { title: string; description: string; placeholder: string }
> = {
  order_number: { title: 'Filter by order #', description: 'Match order number text.', placeholder: 'e.g. TUC/26-' },
  customer: { title: 'Filter by customer', description: 'Match customer name.', placeholder: 'e.g. Rajiv' },
  mobile: { title: 'Filter by mobile', description: 'Match customer phone/mobile.', placeholder: 'e.g. 98' },
  date: { title: 'Filter by date', description: 'Match visible formatted date.', placeholder: 'e.g. 17 Apr' },
  status: { title: 'Filter by status', description: 'Match status text.', placeholder: 'e.g. under_procurement' },
  amount: { title: 'Filter by amount', description: 'Match formatted amount text.', placeholder: 'e.g. 13014' },
  sales_manager: { title: 'Filter by sales manager', description: 'Match manager name.', placeholder: 'e.g. Yeshwanth' },
};

function includesFilter(filterRaw: string, value: string): boolean {
  const f = filterRaw.trim().toLowerCase();
  if (!f) return true;
  return value.toLowerCase().includes(f);
}

function ColumnFilterTrigger({
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
      className={cn(
        'h-7 w-7 shrink-0 rounded-full transition-all duration-200 ease-out',
        active
          ? 'bg-primary/20 text-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.45),0_4px_14px_-4px_hsl(var(--primary)/0.45)] ring-2 ring-primary/50 ring-offset-2 ring-offset-background hover:bg-primary/28 hover:ring-primary/65'
          : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
      )}
    >
      <Filter
        className={cn(
          'h-3.5 w-3.5 transition-transform duration-200 ease-out',
          active && 'scale-110 fill-primary text-primary [filter:drop-shadow(0_0_5px_hsl(var(--primary)/0.55))]'
        )}
        strokeWidth={active ? 2.5 : 2}
        aria-hidden
      />
    </Button>
  );
}

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function QuotationsPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState<'no' | 'yes'>('no');
  const [employeeMap, setEmployeeMap] = useState<Record<string, { full_name: string; avatar_url?: string }>>({});
  const [columnFilters, setColumnFilters] = useState<QuotationsColumnFilters>({ ...EMPTY_COLUMN_FILTERS });
  const [filterDialogColumn, setFilterDialogColumn] = useState<QuotationsFilterColumnKey | null>(null);
  const hasActiveColumnFilters = Object.values(columnFilters).some((v) => v.trim().length > 0);
  const filterDialogMeta = filterDialogColumn ? FILTER_META[filterDialogColumn] : null;

  useEffect(() => {
    fetchOrders();
  }, [showCompleted]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      let query: any = supabase
        .from('orders')
        .select(`*, customer:customers(company_name, phone), gst_rate`)
        .eq('is_deleted', false);

      if (showCompleted === 'no') {
        query = query.neq('status', 'completed');
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      const list: Order[] = data || [];
      const orderIds = list.map((o) => o.id).filter(Boolean);
      const additionalByOrderId = new Map<string, number>();
      if (orderIds.length > 0) {
        const { data: chargeRows, error: chErr } = await supabase
          .from('order_additional_charges')
          .select('order_id, amount_incl_gst')
          .in('order_id', orderIds as any);
        if (!chErr && chargeRows) {
          for (const row of chargeRows as { order_id: string; amount_incl_gst: number | null }[]) {
            if (!row?.order_id) continue;
            const amt = Number(row.amount_incl_gst || 0);
            additionalByOrderId.set(
              row.order_id,
              (additionalByOrderId.get(row.order_id) ?? 0) + amt
            );
          }
        }
      }

      // Calculate correct amounts using size-based pricing for each order
      const ordersWithCalculatedAmounts = await Promise.all(
        list.map(async (order) => {
          try {
            // Fetch order items to calculate correct total
            const { data: orderItems } = await supabase
              .from('order_items')
              .select('*, size_prices, sizes_quantities, specifications')
              .eq('order_id', order.id);
            
            // Calculate correct total using size-based pricing
            let calculatedAmount = order.final_amount; // Fallback to final_amount
            if (orderItems && orderItems.length > 0) {
              const summary = calculateOrderSummary(orderItems, order);
              const extra = additionalByOrderId.get(order.id) ?? 0;
              calculatedAmount = summary.grandTotal + extra;
            }
            
            return {
              ...order,
              calculatedAmount
            };
          } catch (error) {
            console.error(`Error calculating amount for order ${order.order_number}:`, error);
            return {
              ...order,
              calculatedAmount: order.final_amount // Fallback to final_amount on error
            };
          }
        })
      );
      
      setOrders(ordersWithCalculatedAmounts);

      // Fetch sales manager names/avatars in a second query (avoids FK join issues)
      const ids = Array.from(new Set(list.map(o => o.sales_manager).filter(Boolean)));
      if (ids.length > 0) {
        const { data: emps, error: empErr } = await supabase
          .from('employees')
          .select('id, full_name, avatar_url')
          .in('id', ids as any);
        if (!empErr && emps) {
          const map: Record<string, { full_name: string; avatar_url?: string }> = {};
          (emps as any[]).forEach(e => { map[e.id] = { full_name: e.full_name, avatar_url: e.avatar_url }; });
          setEmployeeMap(map);
        } else {
          setEmployeeMap({});
        }
      } else {
        setEmployeeMap({});
      }
    } catch (error) {
      toast.error('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const mobile = getCustomerMobile(order.customer as any) || '';
      const dateLabel = new Date(order.order_date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: '2-digit',
      });
      const amountLabel = formatCurrency(order.calculatedAmount ?? order.final_amount ?? 0);
      const manager = employeeMap[order.sales_manager || '']?.full_name || '-';
      return (
        includesFilter(columnFilters.order_number, order.order_number || '') &&
        includesFilter(columnFilters.customer, order.customer?.company_name || '') &&
        includesFilter(columnFilters.mobile, mobile) &&
        includesFilter(columnFilters.date, dateLabel) &&
        includesFilter(columnFilters.status, order.status || '') &&
        includesFilter(columnFilters.amount, amountLabel) &&
        includesFilter(columnFilters.sales_manager, manager)
      );
    });
  }, [orders, columnFilters, employeeMap]);

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Quotations</h1>
          <p className="text-muted-foreground mt-1">View all orders and create/send quotations</p>
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle>All Orders (for Quotation)</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Show completed</span>
                <Select value={showCompleted} onValueChange={(v: 'no' | 'yes') => setShowCompleted(v)}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="No (default)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No (default)</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={fetchOrders}>Refresh</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Desktop/tablet table view */}
            <div className="hidden md:block overflow-x-auto">
              <Table className="min-w-[1080px]">
                <TableHeader>
                  <TableRow>
                        <TableHead className="w-[140px]">
                          <div className="flex items-center gap-1">Order #<ColumnFilterTrigger active={!!columnFilters.order_number} ariaLabel="Filter order number" onOpen={() => setFilterDialogColumn('order_number')} /></div>
                        </TableHead>
                        <TableHead className="min-w-[180px]">
                          <div className="flex items-center gap-1">Customer<ColumnFilterTrigger active={!!columnFilters.customer} ariaLabel="Filter customer" onOpen={() => setFilterDialogColumn('customer')} /></div>
                        </TableHead>
                        <TableHead className="w-[120px]">
                          <div className="flex items-center gap-1">Mobile<ColumnFilterTrigger active={!!columnFilters.mobile} ariaLabel="Filter mobile" onOpen={() => setFilterDialogColumn('mobile')} /></div>
                        </TableHead>
                        <TableHead className="w-[120px] whitespace-nowrap">
                          <div className="flex items-center gap-1">Date<ColumnFilterTrigger active={!!columnFilters.date} ariaLabel="Filter date" onOpen={() => setFilterDialogColumn('date')} /></div>
                        </TableHead>
                        <TableHead className="w-[120px] whitespace-nowrap">
                          <div className="flex items-center gap-1">Status<ColumnFilterTrigger active={!!columnFilters.status} ariaLabel="Filter status" onOpen={() => setFilterDialogColumn('status')} /></div>
                        </TableHead>
                        <TableHead className="w-[130px] text-right">
                          <div className="flex items-center justify-end gap-1">Amount<ColumnFilterTrigger active={!!columnFilters.amount} ariaLabel="Filter amount" onOpen={() => setFilterDialogColumn('amount')} /></div>
                        </TableHead>
                        <TableHead className="min-w-[170px]">
                          <div className="flex items-center gap-1">Sales Manager<ColumnFilterTrigger active={!!columnFilters.sales_manager} ariaLabel="Filter sales manager" onOpen={() => setFilterDialogColumn('sales_manager')} /></div>
                        </TableHead>
                    <TableHead className="w-[220px] whitespace-nowrap">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={8}>Loading...</TableCell></TableRow>
                      ) : filteredOrders.length === 0 ? (
                    <TableRow><TableCell colSpan={8}>No orders found.</TableCell></TableRow>
                  ) : (
                        filteredOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.order_number}</TableCell>
                        <TableCell className="max-w-[220px] truncate">{order.customer?.company_name}</TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {getCustomerMobile(order.customer as any) || '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{new Date(order.order_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</TableCell>
                        <TableCell className="whitespace-nowrap"><Badge>{order.status}</Badge></TableCell>
                        <TableCell className="text-right whitespace-nowrap">{formatCurrency(order.calculatedAmount ?? order.final_amount ?? 0)}</TableCell>
                        <TableCell>
                          {employeeMap[order.sales_manager || ''] ? (
                            <div className="flex items-center gap-2 min-w-0">
                              {employeeMap[order.sales_manager!].avatar_url && (
                                <img
                                  src={employeeMap[order.sales_manager!].avatar_url as string}
                                  alt={employeeMap[order.sales_manager!].full_name}
                                  className="w-6 h-6 rounded-full object-cover"
                                />
                              )}
                              <span className="truncate">{employeeMap[order.sales_manager!].full_name}</span>
                            </div>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col xl:flex-row gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="whitespace-nowrap"
                              onClick={() => navigate(`/accounts/quotations/${order.id}`)}
                            >
                              <Eye className="w-4 h-4 mr-1" /> Quotation
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="whitespace-nowrap"
                              onClick={() => navigate('/accounts/receipts', { state: { prefill: { type: 'order', id: order.id, number: order.order_number, date: order.order_date, customer_id: order.customer_id, amount: order.calculatedAmount ?? order.final_amount }, tab: 'create' } })}
                            >
                              Create Receipt
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile card view */}
            <div className="md:hidden space-y-3">
              {loading ? (
                <Card className="border-dashed">
                  <CardContent className="p-4 text-sm text-muted-foreground">Loading...</CardContent>
                </Card>
              ) : orders.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="p-4 text-sm text-muted-foreground">No orders found.</CardContent>
                </Card>
              ) : (
                filteredOrders.map((order) => (
                  <Card key={order.id}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Order #</p>
                          <p className="font-semibold break-words">{order.order_number}</p>
                        </div>
                        <Badge>{order.status}</Badge>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground">Customer</p>
                        <p className="font-medium break-words">{order.customer?.company_name || '-'}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Mobile</p>
                          <p className="font-mono text-xs">{getCustomerMobile(order.customer as any) || '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Date</p>
                          <p>{new Date(order.order_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Amount</p>
                          <p className="font-medium">{formatCurrency(order.calculatedAmount ?? order.final_amount ?? 0)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Sales Manager</p>
                          <p className="break-words">{employeeMap[order.sales_manager || '']?.full_name || '-'}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/accounts/quotations/${order.id}`)}
                        >
                          <Eye className="w-4 h-4 mr-1" /> Quotation
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate('/accounts/receipts', { state: { prefill: { type: 'order', id: order.id, number: order.order_number, date: order.order_date, customer_id: order.customer_id, amount: order.calculatedAmount ?? order.final_amount }, tab: 'create' } })}
                        >
                          Create Receipt
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
            {hasActiveColumnFilters && (
              <div className="flex justify-end mt-3">
                <Button variant="ghost" size="sm" onClick={() => setColumnFilters({ ...EMPTY_COLUMN_FILTERS })}>
                  Clear column filters
                </Button>
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
    </ErpLayout>
  );
} 