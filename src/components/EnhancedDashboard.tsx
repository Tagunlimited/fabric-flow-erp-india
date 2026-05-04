import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
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
  Crown,
  RefreshCw,
  AlertTriangle,
  Layers,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { shouldRetryReadWithoutIsDeletedFilter } from "@/lib/supabaseSoftDeleteCompat";
import {
  calculateOrderItemAmount,
  calculateOrderSummary,
  parseOrderItemSpecifications,
} from "@/utils/priceCalculation";
import { sumActiveReceiptAmountsForOrder } from "@/utils/orderFinancials";
import {
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";
import { cn } from "@/lib/utils";

type EnrichedOrder = {
  id: string;
  order_number: string;
  order_date: string | null;
  sales_manager: string | null;
  revenue: number;
  received: number;
  balance: number;
  lineQuantity: number;
};

type SalesPersonRow = {
  employeeId: string;
  name: string;
  avatarUrl?: string;
  revenue: number;
  received: number;
  balance: number;
  orderCount: number;
  totalQuantity: number;
};

const CHART_REVENUE = "hsl(214 88% 42%)";

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

function makeInsideBarLabelRenderer(
  rows: Array<{ revenue: number; quantity?: number }>
) {
  return (props: any) => {
    const { x, y, width, height, value, index } = props || {};
    const revenue = Number(value ?? 0);
    if (!Number.isFinite(revenue) || revenue <= 0) return null;

    const idx = Number(index ?? -1);
    const quantity =
      idx >= 0 && idx < rows.length ? Number(rows[idx]?.quantity || 0) : 0;

    const safeX = Number(x || 0);
    const safeY = Number(y || 0);
    const safeWidth = Number(width || 0);
    const safeHeight = Number(height || 0);
    const textX = safeX + Math.max(safeWidth - 8, 10);
    const textY = safeY + safeHeight / 2;
    const valueText = inr(revenue);
    const qtyText = quantity > 0 ? `Qty: ${quantity.toLocaleString("en-IN")}` : "";
    const isNarrowBar = safeWidth < 110 || safeHeight < 18;

    return (
      <text
        x={textX}
        y={textY}
        textAnchor="end"
        dominantBaseline="middle"
        fill="white"
        fontSize={10}
        fontWeight={600}
        pointerEvents="none"
      >
        <tspan x={textX} dy={isNarrowBar ? "0" : qtyText ? "-0.45em" : "0"}>
          {valueText}
        </tspan>
        {!isNarrowBar && qtyText ? (
          <tspan x={textX} dy="1.1em" fontWeight={500}>
            {qtyText}
          </tspan>
        ) : null}
      </text>
    );
  };
}

function RankMedalBadge({ rank }: { rank: number }) {
  if (rank !== 2 && rank !== 3) return null;
  const isSilver = rank === 2;
  const fill = isSilver ? "#C0C7D1" : "#CD7F32";
  const stroke = isSilver ? "#98A2B3" : "#8B5A2B";
  const text = rank === 2 ? "2nd" : "3rd";
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" className="shrink-0">
      <circle cx="15" cy="15" r="12" fill={fill} stroke={stroke} strokeWidth="1.5" />
      <text
        x="15"
        y="16"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="7"
        fontWeight="700"
        fill="#ffffff"
      >
        {text}
      </text>
    </svg>
  );
}

function lineGrandTotalInclGst(item: unknown, order: { gst_rate?: number | null } | null): number {
  const it = item as Record<string, unknown>;
  const amount = calculateOrderItemAmount(it);
  const specs = parseOrderItemSpecifications(it);
  const gstRate = Number(
    (it.gst_rate as number | undefined) ??
      specs.gst_rate ??
      order?.gst_rate ??
      0
  );
  return amount + (amount * gstRate) / 100;
}

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

type CategoryRevenueRow = { name: string; fullName: string; revenue: number; quantity: number };

function lineItemQuantity(it: Record<string, unknown>): number {
  const n = Number(it.quantity);
  if (Number.isFinite(n) && n > 0) return n;
  const sq = it.sizes_quantities as Record<string, unknown> | null | undefined;
  if (sq && typeof sq === "object" && !Array.isArray(sq)) {
    return Object.values(sq).reduce<number>((sum, v) => sum + Number(v ?? 0), 0);
  }
  return 0;
}

type DashboardPeriod =
  | "this_week"
  | "previous_week"
  | "this_month"
  | "previous_month"
  | "last_30_days"
  | "this_year"
  | "previous_year";

type DateRange = {
  startDate: string;
  endDate: string;
};

const PERIOD_OPTIONS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: "this_week", label: "This Week" },
  { value: "previous_week", label: "Previous Week" },
  { value: "this_month", label: "This Month" },
  { value: "previous_month", label: "Previous Month" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "this_year", label: "This Year" },
  { value: "previous_year", label: "Previous Year" },
];

function toDateOnly(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function getDashboardPeriodRange(period: DashboardPeriod, now = new Date()): DateRange {
  switch (period) {
    case "this_week": {
      const start = startOfWeek(now, { weekStartsOn: 1 });
      const end = endOfWeek(now, { weekStartsOn: 1 });
      return { startDate: toDateOnly(start), endDate: toDateOnly(end) };
    }
    case "previous_week": {
      const base = subWeeks(now, 1);
      const start = startOfWeek(base, { weekStartsOn: 1 });
      const end = endOfWeek(base, { weekStartsOn: 1 });
      return { startDate: toDateOnly(start), endDate: toDateOnly(end) };
    }
    case "previous_month": {
      const base = subMonths(now, 1);
      const start = startOfMonth(base);
      const end = endOfMonth(base);
      return { startDate: toDateOnly(start), endDate: toDateOnly(end) };
    }
    case "last_30_days": {
      const start = subDays(now, 29);
      return { startDate: toDateOnly(start), endDate: toDateOnly(now) };
    }
    case "this_year": {
      const start = startOfYear(now);
      const end = endOfYear(now);
      return { startDate: toDateOnly(start), endDate: toDateOnly(end) };
    }
    case "previous_year": {
      const base = subYears(now, 1);
      const start = startOfYear(base);
      const end = endOfYear(base);
      return { startDate: toDateOnly(start), endDate: toDateOnly(end) };
    }
    case "this_month":
    default: {
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      return { startDate: toDateOnly(start), endDate: toDateOnly(end) };
    }
  }
}

async function loadSalesDashboard(range: DateRange): Promise<{
  orders: EnrichedOrder[];
  employees: Record<string, { id: string; full_name: string; avatar_url?: string }>;
  categoryRevenue: CategoryRevenueRow[];
}> {
  const ordersBase = () =>
    supabase
      .from("orders")
      .select("id, order_number, order_date, sales_manager, final_amount, total_amount, gst_rate")
      .or("order_type.is.null,order_type.eq.custom")
      .gte("order_date", range.startDate)
      .lte("order_date", range.endDate)
      .order("created_at", { ascending: false });

  let { data: orderRows, error: orderErr } = await ordersBase().eq("is_deleted", false);
  if (orderErr && shouldRetryReadWithoutIsDeletedFilter(orderErr)) {
    const retry = await ordersBase();
    orderRows = retry.data;
    orderErr = retry.error;
  }
  if (orderErr) throw orderErr;

  const list = (orderRows || []).filter((o: any) => !o?.is_deleted);
  const orderIds = list.map((o) => o.id).filter(Boolean);
  const orderNumbers = list.map((o) => o.order_number).filter(Boolean);

  const [{ data: itemRows }, { data: receiptsById }, { data: receiptsByNumber }] =
    await Promise.all([
      orderIds.length
        ? supabase
            .from("order_items")
            .select(
              "order_id, id, unit_price, quantity, size_prices, sizes_quantities, specifications, gst_rate, product_category_id, product_category:product_categories(category_name)"
            )
            .eq("is_deleted", false)
            .in("order_id", orderIds)
        : Promise.resolve({ data: [] as any[] }),
      orderIds.length
        ? supabase
            .from("receipts")
            .select("id, reference_id, reference_number, amount, status")
            .eq("is_deleted", false)
            .in("reference_id", orderIds)
        : Promise.resolve({ data: [] as any[] }),
      orderNumbers.length
        ? supabase
            .from("receipts")
            .select("id, reference_id, reference_number, amount, status")
            .eq("is_deleted", false)
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

  const categoryTotals = new Map<string, number>();
  const categoryQty = new Map<string, number>();
  for (const order of list as Array<Record<string, unknown> & { id: string }>) {
    const items = (itemsByOrder[order.id] || []) as Array<
      Record<string, unknown> & {
        product_category?: { category_name?: string | null } | null;
      }
    >;
    const additionalSum = additionalByOrderId.get(order.id) ?? 0;
    if (items.length === 0) {
      const fallbackRev = Number(order.final_amount || order.total_amount || 0);
      if (fallbackRev > 0) {
        const label = "No line items";
        categoryTotals.set(label, (categoryTotals.get(label) ?? 0) + fallbackRev);
      }
      continue;
    }
    const lineTotals = items.map((it) => lineGrandTotalInclGst(it, order as any));
    const sumLines = lineTotals.reduce((a, b) => a + b, 0);
    items.forEach((it, idx) => {
      const rawName = it.product_category?.category_name?.trim();
      const catName = rawName && rawName.length > 0 ? rawName : "Uncategorized";
      const base = lineTotals[idx];
      let allocated = base;
      if (additionalSum !== 0) {
        if (sumLines > 0) {
          allocated += additionalSum * (base / sumLines);
        } else {
          allocated += additionalSum / items.length;
        }
      }
      categoryTotals.set(catName, (categoryTotals.get(catName) ?? 0) + allocated);
      const q = lineItemQuantity(it);
      categoryQty.set(catName, (categoryQty.get(catName) ?? 0) + q);
    });
  }

  const categorySorted = Array.from(categoryTotals.entries()).sort((a, b) => b[1] - a[1]);
  const topN = 12;
  const categoryRevenue: CategoryRevenueRow[] = [];
  const top = categorySorted.slice(0, topN);
  const restSum = categorySorted.slice(topN).reduce((s, [, v]) => s + v, 0);
  for (const [fullName, revenue] of top) {
    categoryRevenue.push({
      fullName,
      name: fullName.length > 18 ? `${fullName.slice(0, 16)}…` : fullName,
      revenue,
      quantity: categoryQty.get(fullName) ?? 0,
    });
  }
  if (restSum > 0) {
    const restQty = categorySorted
      .slice(topN)
      .reduce((s, [k]) => s + (categoryQty.get(k) ?? 0), 0);
    categoryRevenue.push({
      fullName: "All other categories",
      name: "Others",
      revenue: restSum,
      quantity: restQty,
    });
  }

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
    const lineQuantity = items.reduce((sum: number, it: Record<string, unknown>) => {
      return sum + lineItemQuantity(it);
    }, 0);
    return {
      id: order.id,
      order_number: order.order_number,
      order_date: order.order_date,
      sales_manager: order.sales_manager ?? null,
      revenue,
      received,
      balance,
      lineQuantity,
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

  return { orders: enriched, employees, categoryRevenue };
}

export function EnhancedDashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState<DashboardPeriod>("this_month");
  const [orders, setOrders] = useState<EnrichedOrder[]>([]);
  const [employees, setEmployees] = useState<
    Record<string, { id: string; full_name: string; avatar_url?: string }>
  >({});
  const [categoryRevenue, setCategoryRevenue] = useState<CategoryRevenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const periodRange = useMemo(() => getDashboardPeriodRange(selectedPeriod), [selectedPeriod]);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { orders: o, employees: e, categoryRevenue: cr } = await loadSalesDashboard(periodRange);
      setOrders(o);
      setEmployees(e);
      setCategoryRevenue(cr);
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [periodRange]);

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
      { revenue: number; received: number; balance: number; orderCount: number; totalQuantity: number }
    >();
    for (const o of orders) {
      const key = o.sales_manager || "__none__";
      const cur = bySm.get(key) || {
        revenue: 0,
        received: 0,
        balance: 0,
        orderCount: 0,
        totalQuantity: 0,
      };
      cur.revenue += o.revenue;
      cur.received += o.received;
      cur.balance += o.balance;
      cur.orderCount += 1;
      cur.totalQuantity += Number(o.lineQuantity || 0);
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

  const barLeaderData = useMemo(
    () =>
      salesRows.slice(0, 8).map((r) => ({
        name:
          r.name.length > 14 ? `${r.name.slice(0, 12)}…` : r.name,
        fullName: r.name,
        revenue: r.revenue,
        quantity: r.totalQuantity,
      })),
    [salesRows]
  );
  const leaderBarLabel = useMemo(
    () => makeInsideBarLabelRenderer(barLeaderData),
    [barLeaderData]
  );
  const categoryBarLabel = useMemo(
    () => makeInsideBarLabelRenderer(categoryRevenue),
    [categoryRevenue]
  );

  const rankOne = salesRows[0] || null;
  const rankRest = salesRows.slice(1);

  if (loading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-10 w-64 rounded-lg bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-muted" />
          ))}
        </div>
        <div className="h-28 rounded-2xl bg-muted" />
        <div className="h-80 rounded-2xl bg-muted" />
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
            Revenue, collections, performance by sales manager, and revenue by product category (custom
            orders).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={selectedPeriod}
            onValueChange={(value: DashboardPeriod) => setSelectedPeriod(value)}
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refresh()} className="shrink-0 gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border bg-card/80 shadow-sm backdrop-blur-sm">
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
                          <p className="text-muted-foreground tabular-nums">
                            Qty: {Number((row as any).quantity || 0).toLocaleString("en-IN")}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="revenue"
                    name="Revenue"
                    fill={CHART_REVENUE}
                    radius={[0, 6, 6, 0]}
                    label={leaderBarLabel}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl border bg-card/80 shadow-sm backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Layers className="h-5 w-5 text-violet-500" />
              Revenue by product category
            </CardTitle>
            <CardDescription>
              Line totals including GST, with order-level additional charges split by line share (same basis
              as total revenue). Quantity is sum of line units (order line quantity or sizes breakdown).
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[320px] pt-0">
            {categoryRevenue.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No categorized line items yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryRevenue}
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
                    width={120}
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null;
                      const row = payload[0].payload as CategoryRevenueRow;
                      return (
                        <div className="rounded-lg border bg-background/95 px-3 py-2 text-xs shadow-md">
                          <p className="font-medium">{row.fullName}</p>
                          <p className="text-muted-foreground">{inr(row.revenue)}</p>
                          <p className="text-muted-foreground tabular-nums">
                            Qty: {row.quantity.toLocaleString("en-IN")}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="revenue"
                    name="Revenue"
                    fill={CHART_REVENUE}
                    radius={[0, 6, 6, 0]}
                    label={categoryBarLabel}
                  />
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
          {salesRows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No orders found.</div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
              {rankOne ? (
                <Card className="border-amber-300/70 bg-amber-50/40 dark:bg-amber-500/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Crown className="h-5 w-5 text-amber-500" />
                      Rank 1 Champion
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-col items-center text-center">
                      <div className="relative">
                        <Avatar className="h-24 w-24 border-2 border-amber-400/80">
                          <AvatarImage src={rankOne.avatarUrl} alt="" />
                          <AvatarFallback className="bg-muted text-lg font-semibold">
                            {rankOne.name
                              .split(/\s+/)
                              .map((w) => w[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                          <Crown
                            className="h-8 w-8 text-amber-500 drop-shadow"
                            fill="currentColor"
                            strokeWidth={1.5}
                          />
                        </div>
                      </div>
                      <p className="mt-3 font-semibold">{rankOne.name}</p>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Rank</span>
                        <span className="font-semibold tabular-nums">1</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Orders</span>
                        <span className="font-semibold tabular-nums">{rankOne.orderCount}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Revenue</span>
                        <span className="font-semibold tabular-nums">{inr(rankOne.revenue)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Received</span>
                        <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {inr(rankOne.received)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Balance</span>
                        <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                          {inr(rankOne.balance)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Collected</span>
                        <span className="font-semibold tabular-nums">
                          {rankOne.revenue > 0
                            ? Math.min(100, Math.round((rankOne.received / rankOne.revenue) * 100))
                            : 0}
                          %
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

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
                    {rankRest.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                          Only one sales manager in this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      rankRest.map((row, idx) => {
                        const rank = idx + 2;
                        const pct =
                          row.revenue > 0 ? Math.min(100, Math.round((row.received / row.revenue) * 100)) : 0;
                        return (
                          <TableRow key={row.employeeId || `unassigned-${idx + 1}`} className="group">
                            <TableCell>
                              <Badge variant="secondary" className="tabular-nums font-mono">
                                {rank}
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
                                <RankMedalBadge rank={rank} />
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
            </div>
          )}
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
