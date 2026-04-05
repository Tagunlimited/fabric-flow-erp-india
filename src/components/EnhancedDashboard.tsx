import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  IndianRupee,
  Wallet,
  Banknote,
  ShoppingBag,
  Trophy,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { calculateOrderSummary } from "@/utils/priceCalculation";
import { sumActiveReceiptAmountsForOrder } from "@/utils/orderFinancials";
import { format, parse, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

type EnrichedOrder = {
  id: string;
  order_number: string;
  order_date: string | null;
  sales_manager: string | null;
  revenue: number;
  received: number;
  balance: number;
};

type SalesPersonRow = {
  employeeId: string;
  name: string;
  avatarUrl?: string;
  revenue: number;
  received: number;
  balance: number;
  orderCount: number;
};

const CHART_REVENUE = "hsl(214 88% 42%)";
const CHART_RECEIVED = "hsl(152 60% 40%)";

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

const inrCompact = (n: number) => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(2)} K`;
  return inr(n);
};

function groupItemsByOrderId(
  rows: Array<{ order_id: string } & Record<string, unknown>>
): Record<string, typeof rows> {
  const map: Record<string, typeof rows> = {};
  for (const row of rows) {
    const oid = row.order_id;
    if (!oid) continue;
    if (!map[oid]) map[oid] = [];
    map[oid].push(row);
  }
  return map;
}

async function loadSalesDashboard(): Promise<{
  orders: EnrichedOrder[];
  employees: Record<string, { id: string; full_name: string; avatar_url?: string }>;
}> {
  const { data: orderRows, error: orderErr } = await supabase
    .from("orders")
    .select("id, order_number, order_date, sales_manager, final_amount, total_amount, gst_rate")
    .or("order_type.is.null,order_type.eq.custom")
    .order("created_at", { ascending: false });

  if (orderErr) throw orderErr;

  const list = orderRows || [];
  const orderIds = list.map((o) => o.id).filter(Boolean);
  const orderNumbers = list.map((o) => o.order_number).filter(Boolean);

  const [{ data: itemRows }, { data: receiptsById }, { data: receiptsByNumber }] =
    await Promise.all([
      orderIds.length
        ? supabase
            .from("order_items")
            .select(
              "order_id, id, unit_price, quantity, size_prices, sizes_quantities, specifications, gst_rate"
            )
            .in("order_id", orderIds)
        : Promise.resolve({ data: [] as any[] }),
      orderIds.length
        ? supabase
            .from("receipts")
            .select("id, reference_id, reference_number, amount, status")
            .in("reference_id", orderIds)
        : Promise.resolve({ data: [] as any[] }),
      orderNumbers.length
        ? supabase
            .from("receipts")
            .select("id, reference_id, reference_number, amount, status")
            .in("reference_number", orderNumbers)
        : Promise.resolve({ data: [] as any[] }),
    ]);

  let chargesRows: { order_id: string; amount_incl_gst: number | null }[] = [];
  if (orderIds.length > 0) {
    const { data: ch, error: chargesError } = await supabase
      .from("order_additional_charges")
      .select("order_id, amount_incl_gst")
      .in("order_id", orderIds);
    if (chargesError) {
      console.warn("order_additional_charges fetch for sales dashboard:", chargesError);
    } else {
      chargesRows = (ch || []) as typeof chargesRows;
    }
  }

  const receiptMap = new Map<
    string,
    {
      id: string;
      reference_id: string | null;
      reference_number: string | null;
      amount: number | null;
      status?: string | null;
    }
  >();
  [...(receiptsById || []), ...(receiptsByNumber || [])].forEach((r: any) => {
    if (r?.id) receiptMap.set(r.id, r);
  });
  const receiptRows = Array.from(receiptMap.values());

  const additionalByOrderId = new Map<string, number>();
  for (const row of chargesRows) {
    if (!row?.order_id) continue;
    const amt = Number(row.amount_incl_gst || 0);
    additionalByOrderId.set(row.order_id, (additionalByOrderId.get(row.order_id) ?? 0) + amt);
  }

  const itemsByOrder = groupItemsByOrderId(itemRows || []);

  const enriched: EnrichedOrder[] = list.map((order: any) => {
    const items = itemsByOrder[order.id] || [];
    const additionalSum = additionalByOrderId.get(order.id) ?? 0;
    let revenue: number;
    if (items.length > 0) {
      revenue = calculateOrderSummary(items, order).grandTotal + additionalSum;
    } else {
      revenue = Number(order.final_amount || order.total_amount || 0);
    }
    const received = sumActiveReceiptAmountsForOrder(
      receiptRows,
      order.id,
      order.order_number
    );
    const balance = Math.max(revenue - received, 0);
    return {
      id: order.id,
      order_number: order.order_number,
      order_date: order.order_date,
      sales_manager: order.sales_manager ?? null,
      revenue,
      received,
      balance,
    };
  });

  const managerIds = Array.from(
    new Set(enriched.map((o) => o.sales_manager).filter(Boolean) as string[])
  );

  let employees: Record<string, { id: string; full_name: string; avatar_url?: string }> = {};
  if (managerIds.length > 0) {
    const { data: emps, error: empErr } = await supabase
      .from("employees")
      .select("id, full_name, avatar_url")
      .in("id", managerIds);
    if (!empErr && emps) {
      employees = emps.reduce(
        (acc, e) => {
          acc[e.id] = e;
          return acc;
        },
        {} as typeof employees
      );
    }
  }

  return { orders: enriched, employees };
}

const ChartTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string; dataKey?: string; color?: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur">
      <p className="font-medium text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full align-middle mr-1.5" style={{ background: p.color }} />
          {p.name}: {inr(Number(p.value) || 0)}
        </p>
      ))}
    </div>
  );
};

export function EnhancedDashboard() {
  const [orders, setOrders] = useState<EnrichedOrder[]>([]);
  const [employees, setEmployees] = useState<
    Record<string, { id: string; full_name: string; avatar_url?: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { orders: o, employees: e } = await loadSalesDashboard();
      setOrders(o);
      setEmployees(e);
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totals = useMemo(() => {
    const totalRevenue = orders.reduce((s, o) => s + o.revenue, 0);
    const totalReceived = orders.reduce((s, o) => s + o.received, 0);
    const totalBalance = orders.reduce((s, o) => s + o.balance, 0);
    return {
      totalRevenue,
      totalReceived,
      totalBalance,
      totalOrders: orders.length,
    };
  }, [orders]);

  const salesRows: SalesPersonRow[] = useMemo(() => {
    const bySm = new Map<
      string,
      { revenue: number; received: number; balance: number; orderCount: number }
    >();
    for (const o of orders) {
      const key = o.sales_manager || "__none__";
      const cur = bySm.get(key) || {
        revenue: 0,
        received: 0,
        balance: 0,
        orderCount: 0,
      };
      cur.revenue += o.revenue;
      cur.received += o.received;
      cur.balance += o.balance;
      cur.orderCount += 1;
      bySm.set(key, cur);
    }
    const rows: SalesPersonRow[] = [];
    bySm.forEach((agg, key) => {
      const employeeId = key === "__none__" ? "" : key;
      const emp = employeeId ? employees[employeeId] : undefined;
      rows.push({
        employeeId,
        name: emp?.full_name || (key === "__none__" ? "Unassigned" : "Unknown"),
        avatarUrl: emp?.avatar_url,
        ...agg,
      });
    });
    return rows.sort((a, b) => b.revenue - a.revenue);
  }, [orders, employees]);

  const monthlySeries = useMemo(() => {
    const map = new Map<string, { month: string; revenue: number; received: number }>();
    for (const o of orders) {
      if (!o.order_date) continue;
      let monthKey: string;
      try {
        monthKey = format(parseISO(o.order_date), "MMM yyyy");
      } catch {
        continue;
      }
      const cur = map.get(monthKey) || { month: monthKey, revenue: 0, received: 0 };
      cur.revenue += o.revenue;
      cur.received += o.received;
      map.set(monthKey, cur);
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      try {
        return (
          parse(a.month, "MMM yyyy", new Date()).getTime() -
          parse(b.month, "MMM yyyy", new Date()).getTime()
        );
      } catch {
        return 0;
      }
    });
    return arr.slice(-12);
  }, [orders]);

  const barLeaderData = useMemo(
    () =>
      salesRows.slice(0, 8).map((r) => ({
        name:
          r.name.length > 14 ? `${r.name.slice(0, 12)}…` : r.name,
        fullName: r.name,
        revenue: r.revenue,
      })),
    [salesRows]
  );

  if (loading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-10 w-64 rounded-lg bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-muted" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-80 rounded-2xl bg-muted" />
          <div className="h-80 rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="rounded-2xl border-destructive/30">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <p className="text-center text-muted-foreground max-w-md">{error}</p>
          <Button variant="outline" onClick={() => refresh()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
            Sales overview
          </h1>
          <p className="mt-1 text-muted-foreground">
            Revenue, collections, and performance by sales manager (custom orders).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refresh()} className="shrink-0 gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total revenue"
          subtitle="Lines + GST + additional charges"
          value={inr(totals.totalRevenue)}
          valueCompact={inrCompact(totals.totalRevenue)}
          icon={IndianRupee}
          className="border-l-4 border-l-[hsl(214_88%_42%)]"
        />
        <StatCard
          title="Amount received"
          subtitle="Receipts linked to orders"
          value={inr(totals.totalReceived)}
          valueCompact={inrCompact(totals.totalReceived)}
          icon={Banknote}
          className="border-l-4 border-l-[hsl(152_60%_40%)]"
        />
        <StatCard
          title="Outstanding balance"
          subtitle="Revenue − received"
          value={inr(totals.totalBalance)}
          valueCompact={inrCompact(totals.totalBalance)}
          icon={Wallet}
          className="border-l-4 border-l-amber-500/80"
        />
        <StatCard
          title="Total orders"
          subtitle="Custom orders in scope"
          value={String(totals.totalOrders)}
          icon={ShoppingBag}
          className="border-l-4 border-l-violet-500/80"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="rounded-2xl border bg-card/80 shadow-sm backdrop-blur-sm lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
              Revenue vs received
            </CardTitle>
            <CardDescription>Last twelve months by order date</CardDescription>
          </CardHeader>
          <CardContent className="h-[320px] pt-0">
            {monthlySeries.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No dated orders to chart yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlySeries} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_REVENUE} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={CHART_REVENUE} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="fillRec" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_RECEIVED} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={CHART_RECEIVED} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => inrCompact(Number(v))}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke={CHART_REVENUE}
                    fill="url(#fillRev)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="received"
                    name="Received"
                    stroke={CHART_RECEIVED}
                    fill="url(#fillRec)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card/80 shadow-sm backdrop-blur-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5 text-amber-500" />
              Leaderboard
            </CardTitle>
            <CardDescription>Top sales managers by revenue</CardDescription>
          </CardHeader>
          <CardContent className="h-[320px] pt-0">
            {barLeaderData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No sales data yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barLeaderData}
                  layout="vertical"
                  margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal className="stroke-border/60" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => inrCompact(Number(v))}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={88}
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null;
                      const row = payload[0].payload as { fullName: string; revenue: number };
                      return (
                        <div className="rounded-lg border bg-background/95 px-3 py-2 text-xs shadow-md">
                          <p className="font-medium">{row.fullName}</p>
                          <p className="text-muted-foreground">{inr(row.revenue)}</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="revenue" name="Revenue" fill={CHART_REVENUE} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border bg-card/80 shadow-sm backdrop-blur-sm overflow-hidden">
        <CardHeader>
          <CardTitle>Sales manager performance</CardTitle>
          <CardDescription>
            Per-person revenue, amount received, and outstanding balance (same rules as Orders list).
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Sales manager</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Collected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                      No orders found.
                    </TableCell>
                  </TableRow>
                ) : (
                  salesRows.map((row, idx) => {
                    const pct =
                      row.revenue > 0 ? Math.min(100, Math.round((row.received / row.revenue) * 100)) : 0;
                    return (
                      <TableRow key={row.employeeId || `unassigned-${idx}`} className="group">
                        <TableCell>
                          <Badge
                            variant={idx === 0 ? "default" : "secondary"}
                            className={cn(
                              "tabular-nums font-mono",
                              idx === 0 && "bg-amber-500/15 text-amber-900 dark:text-amber-100"
                            )}
                          >
                            {idx + 1}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9 border border-border/60">
                              <AvatarImage src={row.avatarUrl} alt="" />
                              <AvatarFallback className="text-xs font-medium bg-muted">
                                {row.name
                                  .split(/\s+/)
                                  .map((w) => w[0])
                                  .join("")
                                  .slice(0, 2)
                                  .toUpperCase() || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{row.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.orderCount}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {inr(row.revenue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                          {inr(row.received)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-amber-700 dark:text-amber-400">
                          {inr(row.balance)}
                        </TableCell>
                        <TableCell className="text-right hidden md:table-cell">
                          <span className="tabular-nums text-muted-foreground">{pct}%</span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  subtitle,
  value,
  valueCompact,
  icon: Icon,
  className,
}: {
  title: string;
  subtitle: string;
  value: string;
  valueCompact?: string;
  icon: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "rounded-2xl border bg-gradient-to-br from-card to-card/60 shadow-sm transition-shadow hover:shadow-md",
        className
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="truncate text-2xl font-bold tracking-tight" title={value}>
              {valueCompact && value.length > 14 ? valueCompact : value}
            </p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
