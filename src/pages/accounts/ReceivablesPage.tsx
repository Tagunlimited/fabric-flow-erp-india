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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatCurrency, formatDateIndian } from '@/lib/utils';
import { calculateOrderSummary } from '@/utils/priceCalculation';
import {
  fetchOrderIdsWithActiveCreditReceipt,
  sumActiveReceiptAmountsForOrder,
} from '@/utils/orderFinancials';
import { CreditOrderBadge } from '@/components/orders/CreditOrderBadge';
import { RefreshCw, Wallet, AlertTriangle, CalendarClock, Receipt } from 'lucide-react';

type ArRow = {
  id: string;
  order_number: string;
  order_date: string;
  status: string;
  customer_id: string;
  customer_name: string;
  calculatedTotal: number;
  received: number;
  pending: number;
  payment_due_date: string | null;
  hasCreditReceipt: boolean;
  daysOverdue: number | null;
};

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(
          `
          *,
          customer:customers(company_name)
        `
        )
        .eq('is_deleted', false)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const list = (data || []) as any[];
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

      setRows(enriched.filter((r) => r.pending > 0));
    } catch (e) {
      console.error(e);
      toast.error('Failed to load receivables');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No outstanding balances</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Order total</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                      <TableHead className="text-right">Pending</TableHead>
                      <TableHead>Payment due</TableHead>
                      <TableHead className="text-right">Days overdue</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Credit</TableHead>
                      <TableHead className="w-[1%]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium whitespace-nowrap">{r.order_number}</TableCell>
                        <TableCell>{r.customer_name}</TableCell>
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
      </div>
    </ErpLayout>
  );
}
