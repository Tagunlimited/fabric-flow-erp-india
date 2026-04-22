import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ErpLayout } from '@/components/ErpLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn, formatCurrency, formatDateIndian } from '@/lib/utils';
import { calculateOrderSummary } from '@/utils/priceCalculation';
import {
  fetchOrderIdsWithActiveCreditReceipt,
  sumActiveReceiptAmountsForOrder,
} from '@/utils/orderFinancials';
import { CreditOrderBadge } from '@/components/orders/CreditOrderBadge';
import { RefreshCw, Wallet, AlertTriangle, CalendarClock, Receipt, Filter } from 'lucide-react';

type ArRow = {
  id: string;
  order_number: string;
  order_date: string;
  status: string;
  sales_manager: string | null;
  customer_id: string;
  customer_name: string;
  calculatedTotal: number;
  received: number;
  pending: number;
  payment_due_date: string | null;
  hasCreditReceipt: boolean;
  daysOverdue: number | null;
};

type ReceivablesColumnFilters = {
  order: string;
  customer: string;
  sales_manager: string;
  order_total: string;
  received: string;
  pending: string;
  due_date: string;
  overdue: string;
  status: string;
  credit: string;
};
const EMPTY_COLUMN_FILTERS: ReceivablesColumnFilters = {
  order: '',
  customer: '',
  sales_manager: '',
  order_total: '',
  received: '',
  pending: '',
  due_date: '',
  overdue: '',
  status: '',
  credit: '',
};
type ReceivablesFilterColumnKey = keyof ReceivablesColumnFilters;
const FILTER_META: Record<ReceivablesFilterColumnKey, { title: string; description: string; placeholder: string }> = {
  order: { title: 'Filter by order', description: 'Match order number.', placeholder: 'e.g. TUC/' },
  customer: { title: 'Filter by customer', description: 'Match customer name.', placeholder: 'e.g. Rajiv' },
  sales_manager: { title: 'Filter by sales manager', description: 'Match manager name.', placeholder: 'e.g. Monika' },
  order_total: { title: 'Filter by order total', description: 'Match formatted amount.', placeholder: 'e.g. 20000' },
  received: { title: 'Filter by received', description: 'Match received amount.', placeholder: 'e.g. 15000' },
  pending: { title: 'Filter by pending', description: 'Match pending amount.', placeholder: 'e.g. 5000' },
  due_date: { title: 'Filter by payment due', description: 'Match due date text.', placeholder: 'e.g. 20 Apr' },
  overdue: { title: 'Filter by overdue days', description: 'Match overdue number.', placeholder: 'e.g. 7' },
  status: { title: 'Filter by status', description: 'Match order status.', placeholder: 'e.g. confirmed' },
  credit: { title: 'Filter by credit', description: 'Match credit badge text.', placeholder: 'e.g. credit' },
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

function overdueDays(paymentDue: string | null | undefined, pending: number): number | null {
  if (pending <= 0 || !paymentDue) return null;
  const due = startOfDay(parseISO(paymentDue));
  const today = startOfDay(new Date());
  if (today <= due) return null;
  return differenceInCalendarDays(today, due);
}

const AGING_COLORS = [
  'hsl(220 14% 46%)',
  'hsl(152 60% 40%)',
  'hsl(38 92% 50%)',
  'hsl(25 95% 53%)',
  'hsl(0 72% 51%)',
];

export default function ReceivablesPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ArRow[]>([]);
  const [employeeMap, setEmployeeMap] = useState<Record<string, { full_name: string; avatar_url?: string }>>({});
  const [selectedSalesManagerId, setSelectedSalesManagerId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState<'no' | 'yes'>('no');
  const [columnFilters, setColumnFilters] = useState<ReceivablesColumnFilters>({ ...EMPTY_COLUMN_FILTERS });
  const [filterDialogColumn, setFilterDialogColumn] = useState<ReceivablesFilterColumnKey | null>(null);
  const filterDialogMeta = filterDialogColumn ? FILTER_META[filterDialogColumn] : null;
  const hasActiveColumnFilters = Object.values(columnFilters).some((v) => v.trim().length > 0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let ordersQuery: any = supabase
        .from('orders')
        .select(
          `
          *,
          customer:customers(company_name)
        `
        )
        .eq('is_deleted', false)
        .neq('status', 'cancelled');
      if (showCompleted === 'no') {
        ordersQuery = ordersQuery.neq('status', 'completed');
      }
      const { data, error } = await ordersQuery.order('created_at', { ascending: false });

      if (error) throw error;

      const list = (data || []) as any[];
      const salesManagerIds = Array.from(new Set(list.map((o) => o.sales_manager).filter(Boolean)));
      const orderIds = list.map((o) => o.id).filter(Boolean);
      const orderNumbers = list.map((o) => o.order_number).filter(Boolean);

      let receiptRows: Array<{
        id: string;
        reference_id: string | null;
        reference_number: string | null;
        amount: number | null;
        status?: string | null;
        payment_mode?: string | null;
        payment_type?: string | null;
      }> = [];

      if (orderIds.length > 0 || orderNumbers.length > 0) {
        const [{ data: receiptsById }, { data: receiptsByNumber }] = await Promise.all([
          orderIds.length > 0
            ? supabase
                .from('receipts')
                .select('id, reference_id, reference_number, amount, status, payment_mode, payment_type')
                .eq('is_deleted', false)
                .in('reference_id', orderIds as any)
            : Promise.resolve({ data: [] as any[] }),
          orderNumbers.length > 0
            ? supabase
                .from('receipts')
                .select('id, reference_id, reference_number, amount, status, payment_mode, payment_type')
                .eq('is_deleted', false)
                .in('reference_number', orderNumbers as any)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const receiptMap = new Map<string, (typeof receiptRows)[0]>();
        [...(receiptsById || []), ...(receiptsByNumber || [])].forEach((receipt: any) => {
          if (!receipt?.id) return;
          receiptMap.set(receipt.id, receipt);
        });
        receiptRows = Array.from(receiptMap.values());
      }

      const creditOrderIdSet =
        orderIds.length > 0 ? await fetchOrderIdsWithActiveCreditReceipt(orderIds) : new Set<string>();

      const additionalByOrderId = new Map<string, number>();
      if (orderIds.length > 0) {
        const { data: chargesRows, error: chargesError } = await supabase
          .from('order_additional_charges')
          .select('order_id, amount_incl_gst')
          .in('order_id', orderIds as any);
        if (chargesError) {
          console.warn('order_additional_charges fetch for receivables:', chargesError);
        } else if (chargesRows) {
          for (const row of chargesRows as { order_id: string; amount_incl_gst: number | null }[]) {
            if (!row?.order_id) continue;
            const amt = Number(row.amount_incl_gst || 0);
            additionalByOrderId.set(row.order_id, (additionalByOrderId.get(row.order_id) ?? 0) + amt);
          }
        }
      }

      const enriched = await Promise.all(
        list.map(async (order) => {
          try {
            const { data: orderItems, error: itemsError } = await supabase
              .from('order_items')
              .select('id, unit_price, quantity, size_prices, sizes_quantities, specifications, gst_rate')
              .eq('order_id', order.id);

            let calculatedTotal = Number(order.final_amount || order.total_amount || 0);
            if (!itemsError && orderItems && orderItems.length > 0) {
              const { grandTotal: lineGrand } = calculateOrderSummary(orderItems, order);
              const additionalSum = additionalByOrderId.get(order.id) ?? 0;
              calculatedTotal = lineGrand + additionalSum;
            } else {
              calculatedTotal += additionalByOrderId.get(order.id) ?? 0;
            }

            const received = sumActiveReceiptAmountsForOrder(receiptRows, order.id, order.order_number);
            const pending = Math.max(0, calculatedTotal - received);
            const paymentDue = (order.payment_due_date as string | null) ?? null;

            return {
              id: order.id,
              order_number: order.order_number,
              order_date: order.order_date,
              status: order.status,
              sales_manager: order.sales_manager ?? null,
              customer_id: order.customer_id,
              customer_name: order.customer?.company_name || '—',
              calculatedTotal,
              received,
              pending,
              payment_due_date: paymentDue,
              hasCreditReceipt: creditOrderIdSet.has(order.id),
              daysOverdue: overdueDays(paymentDue, pending),
            } satisfies ArRow;
          } catch (e) {
            console.error(`Receivables row error for ${order.order_number}:`, e);
            const fallbackAmount = Number(order.final_amount || order.total_amount || 0);
            const received = sumActiveReceiptAmountsForOrder(receiptRows, order.id, order.order_number);
            const pending = Math.max(0, fallbackAmount - received);
            const paymentDue = (order.payment_due_date as string | null) ?? null;
            return {
              id: order.id,
              order_number: order.order_number,
              order_date: order.order_date,
              status: order.status,
              sales_manager: order.sales_manager ?? null,
              customer_id: order.customer_id,
              customer_name: order.customer?.company_name || '—',
              calculatedTotal: fallbackAmount,
              received,
              pending,
              payment_due_date: paymentDue,
              hasCreditReceipt: creditOrderIdSet.has(order.id),
              daysOverdue: overdueDays(paymentDue, pending),
            } satisfies ArRow;
          }
        })
      );

      if (salesManagerIds.length > 0) {
        const { data: emps, error: empErr } = await supabase
          .from('employees')
          .select('id, full_name, avatar_url')
          .in('id', salesManagerIds as any);
        if (!empErr && emps) {
          const map: Record<string, { full_name: string; avatar_url?: string }> = {};
          (emps as any[]).forEach((e) => {
            map[e.id] = { full_name: e.full_name, avatar_url: e.avatar_url };
          });
          setEmployeeMap(map);
        } else {
          setEmployeeMap({});
        }
      } else {
        setEmployeeMap({});
      }

      setRows(enriched.filter((r) => r.pending > 0));
    } catch (e) {
      console.error(e);
      toast.error('Failed to load receivables');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [showCompleted]);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = useMemo(() => {
    const totalOutstanding = rows.reduce((s, r) => s + r.pending, 0);
    const overdueCount = rows.filter((r) => (r.daysOverdue ?? 0) > 0).length;
    const today = startOfDay(new Date());
    const dueWithin7 = rows.reduce((s, r) => {
      if (!r.payment_due_date || r.pending <= 0) return s;
      const due = startOfDay(parseISO(r.payment_due_date));
      const diff = differenceInCalendarDays(due, today);
      if (diff >= 0 && diff <= 7) return s + r.pending;
      return s;
    }, 0);
    return {
      totalOutstanding,
      orderCount: rows.length,
      overdueCount,
      dueWithin7,
    };
  }, [rows]);

  const byCustomer = useMemo(() => {
    const m = new Map<string, { name: string; pending: number }>();
    for (const r of rows) {
      const key = r.customer_id || r.customer_name;
      const cur = m.get(key) || { name: r.customer_name, pending: 0 };
      cur.pending += r.pending;
      m.set(key, cur);
    }
    return [...m.values()]
      .sort((a, b) => b.pending - a.pending)
      .slice(0, 12)
      .map((x) => ({
        name: x.name.length > 22 ? `${x.name.slice(0, 20)}…` : x.name,
        pending: x.pending,
      }));
  }, [rows]);

  const bySalesManager = useMemo(() => {
    const m = new Map<string, { id: string; name: string; pending: number }>();
    for (const r of rows) {
      const managerId = r.sales_manager || '__unassigned__';
      const managerName =
        r.sales_manager && employeeMap[r.sales_manager]?.full_name
          ? employeeMap[r.sales_manager]!.full_name
          : 'Unassigned';
      const cur = m.get(managerId) || { id: managerId, name: managerName, pending: 0 };
      cur.pending += r.pending;
      m.set(managerId, cur);
    }
    return [...m.values()]
      .sort((a, b) => b.pending - a.pending)
      .slice(0, 12)
      .map((x) => ({
        id: x.id,
        name: x.name.length > 22 ? `${x.name.slice(0, 20)}…` : x.name,
        pending: x.pending,
      }));
  }, [rows, employeeMap]);

  const aging = useMemo(() => {
    const b: Record<string, number> = {
      'No due date': 0,
      'Not overdue': 0,
      '1–7 days overdue': 0,
      '8–30 days overdue': 0,
      '31+ days overdue': 0,
    };
    for (const r of rows) {
      if (r.pending <= 0) continue;
      const od = r.daysOverdue;
      if (!r.payment_due_date) b['No due date'] += r.pending;
      else if (od == null) b['Not overdue'] += r.pending;
      else if (od <= 7) b['1–7 days overdue'] += r.pending;
      else if (od <= 30) b['8–30 days overdue'] += r.pending;
      else b['31+ days overdue'] += r.pending;
    }
    return Object.entries(b).map(([name, value]) => ({ name, value }));
  }, [rows]);

  const inrAxis = (v: number) =>
    new Intl.NumberFormat('en-IN', { notation: 'compact', compactDisplay: 'short' }).format(v);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (selectedSalesManagerId) {
        const managerId = r.sales_manager || '__unassigned__';
        if (managerId !== selectedSalesManagerId) return false;
      }
      const credit = r.hasCreditReceipt ? 'credit' : '';
      const managerName = r.sales_manager ? employeeMap[r.sales_manager]?.full_name || '' : '';
      return (
        includesFilter(columnFilters.order, r.order_number || '') &&
        includesFilter(columnFilters.customer, r.customer_name || '') &&
        includesFilter(columnFilters.sales_manager, managerName) &&
        includesFilter(columnFilters.order_total, formatCurrency(r.calculatedTotal)) &&
        includesFilter(columnFilters.received, formatCurrency(r.received)) &&
        includesFilter(columnFilters.pending, formatCurrency(r.pending)) &&
        includesFilter(columnFilters.due_date, r.payment_due_date ? formatDateIndian(r.payment_due_date) : '—') &&
        includesFilter(columnFilters.overdue, r.daysOverdue != null ? String(r.daysOverdue) : '—') &&
        includesFilter(columnFilters.status, String(r.status || '').replace(/_/g, ' ')) &&
        includesFilter(columnFilters.credit, credit)
      );
    });
  }, [rows, columnFilters, employeeMap, selectedSalesManagerId]);

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Receivables
            </h1>
            <p className="text-muted-foreground mt-1">
              Outstanding order balances (line items + additional charges, net of receipts)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Show completed</span>
            <Select value={showCompleted} onValueChange={(v: 'no' | 'yes') => setShowCompleted(v)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="No (default)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no">No (default)</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Total outstanding
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(kpis.totalOutstanding)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Orders with balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{kpis.orderCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Overdue (by due date)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{kpis.overdueCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CalendarClock className="h-4 w-4" />
                Due within 7 days
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(kpis.dueWithin7)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top customers by outstanding</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              {byCustomer.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byCustomer} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tickFormatter={inrAxis} className="text-xs" />
                    <YAxis type="category" dataKey="name" width={120} className="text-xs" />
                    <Tooltip
                      formatter={(v: number) => formatCurrency(v)}
                      contentStyle={{ borderRadius: 8 }}
                    />
                    <Bar dataKey="pending" fill="hsl(214 88% 42%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">Pending by sales manager</CardTitle>
              {selectedSalesManagerId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedSalesManagerId(null)}
                  className="h-8 px-2"
                >
                  Clear
                </Button>
              )}
            </CardHeader>
            <CardContent className="h-[320px]">
              {bySalesManager.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bySalesManager} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tickFormatter={inrAxis} className="text-xs" />
                    <YAxis type="category" dataKey="name" width={120} className="text-xs" />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 8 }} />
                    <Bar
                      dataKey="pending"
                      radius={[0, 4, 4, 0]}
                      onClick={(d: any) => {
                        const id = d?.id as string | undefined;
                        if (!id) return;
                        setSelectedSalesManagerId((prev) => (prev === id ? null : id));
                      }}
                    >
                      {bySalesManager.map((entry) => {
                        const active = selectedSalesManagerId === entry.id;
                        return (
                          <Cell
                            key={entry.id}
                            fill={active ? 'hsl(214 88% 34%)' : 'hsl(214 88% 42%)'}
                            cursor="pointer"
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Aging by payment due date</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={aging}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    {aging.map((_, i) => (
                      <Cell key={i} fill={AGING_COLORS[i % AGING_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outstanding orders</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
            ) : filteredRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No outstanding balances</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead><div className="flex items-center gap-1">Order<ColumnFilterTrigger active={!!columnFilters.order} ariaLabel="Filter order" onOpen={() => setFilterDialogColumn('order')} /></div></TableHead>
                      <TableHead><div className="flex items-center gap-1">Customer<ColumnFilterTrigger active={!!columnFilters.customer} ariaLabel="Filter customer" onOpen={() => setFilterDialogColumn('customer')} /></div></TableHead>
                      <TableHead><div className="flex items-center gap-1">Sales Manager<ColumnFilterTrigger active={!!columnFilters.sales_manager} ariaLabel="Filter sales manager" onOpen={() => setFilterDialogColumn('sales_manager')} /></div></TableHead>
                      <TableHead className="text-right"><div className="flex items-center justify-end gap-1">Order total<ColumnFilterTrigger active={!!columnFilters.order_total} ariaLabel="Filter order total" onOpen={() => setFilterDialogColumn('order_total')} /></div></TableHead>
                      <TableHead className="text-right"><div className="flex items-center justify-end gap-1">Received<ColumnFilterTrigger active={!!columnFilters.received} ariaLabel="Filter received" onOpen={() => setFilterDialogColumn('received')} /></div></TableHead>
                      <TableHead className="text-right"><div className="flex items-center justify-end gap-1">Pending<ColumnFilterTrigger active={!!columnFilters.pending} ariaLabel="Filter pending" onOpen={() => setFilterDialogColumn('pending')} /></div></TableHead>
                      <TableHead><div className="flex items-center gap-1">Payment due<ColumnFilterTrigger active={!!columnFilters.due_date} ariaLabel="Filter due date" onOpen={() => setFilterDialogColumn('due_date')} /></div></TableHead>
                      <TableHead className="text-right"><div className="flex items-center justify-end gap-1">Days overdue<ColumnFilterTrigger active={!!columnFilters.overdue} ariaLabel="Filter overdue days" onOpen={() => setFilterDialogColumn('overdue')} /></div></TableHead>
                      <TableHead><div className="flex items-center gap-1">Status<ColumnFilterTrigger active={!!columnFilters.status} ariaLabel="Filter status" onOpen={() => setFilterDialogColumn('status')} /></div></TableHead>
                      <TableHead><div className="flex items-center gap-1">Credit<ColumnFilterTrigger active={!!columnFilters.credit} ariaLabel="Filter credit" onOpen={() => setFilterDialogColumn('credit')} /></div></TableHead>
                      <TableHead className="w-[1%]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium whitespace-nowrap">{r.order_number}</TableCell>
                        <TableCell>{r.customer_name}</TableCell>
                        <TableCell>
                          {r.sales_manager && employeeMap[r.sales_manager] ? (
                            <div className="flex items-center gap-2">
                              {employeeMap[r.sales_manager].avatar_url && (
                                <img
                                  src={employeeMap[r.sales_manager].avatar_url as string}
                                  alt={employeeMap[r.sales_manager].full_name}
                                  className="w-6 h-6 rounded-full object-cover"
                                />
                              )}
                              <span>{employeeMap[r.sales_manager].full_name}</span>
                            </div>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(r.calculatedTotal)}</TableCell>
                        <TableCell className="text-right text-green-700">{formatCurrency(r.received)}</TableCell>
                        <TableCell className="text-right font-medium text-amber-700">
                          {formatCurrency(r.pending)}
                        </TableCell>
                        <TableCell>
                          {r.payment_due_date ? formatDateIndian(r.payment_due_date) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.daysOverdue != null ? r.daysOverdue : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {String(r.status || '').replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {r.hasCreditReceipt ? (
                            <CreditOrderBadge />
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              navigate('/accounts/receipts', {
                                state: {
                                  prefill: {
                                    type: 'order',
                                    id: r.id,
                                    number: r.order_number,
                                    date: r.order_date,
                                    customer_id: r.customer_id,
                                    amount: r.pending,
                                  },
                                  tab: 'create',
                                },
                              })
                            }
                          >
                            Receipt
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        {hasActiveColumnFilters && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setColumnFilters({ ...EMPTY_COLUMN_FILTERS })}>
              Clear column filters
            </Button>
          </div>
        )}
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
