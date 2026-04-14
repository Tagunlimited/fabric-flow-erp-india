import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, ClipboardList, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Challan has left dispatch / been delivered (excludes pending, packed). */
const TERMINAL_DISPATCH_STATUSES = new Set(["shipped", "delivered", "dispatched"]);

type DispatchRow = {
  id: string;
  dispatch_number: string;
  dispatch_date: string | null;
  created_at?: string | null;
  status: string | null;
  courier_name: string | null;
  tracking_number: string | null;
  actual_delivery: string | null;
  estimated_delivery?: string | null;
};

type InvoiceRow = {
  id: string;
  order_id: string | null;
  invoice_number: string | null;
  created_at: string | null;
};

type OrderRow = {
  id: string;
  order_number: string;
  order_date: string | null;
  status: string | null;
  order_type: string | null;
  expected_delivery_date: string | null;
  customer: { company_name: string | null } | null;
  dispatch_orders: DispatchRow[] | null;
};

function isCustomOrder(order: OrderRow): boolean {
  return !order.order_type || order.order_type === "custom";
}

function isMarkedDispatched(order: OrderRow): boolean {
  if (!isCustomOrder(order)) return false;
  const s = order.status || "";
  if (s === "dispatched" || s === "completed") return true;
  const challans = order.dispatch_orders || [];
  return challans.some((d) => d.status && TERMINAL_DISPATCH_STATUSES.has(d.status));
}

function pickLatestDispatch(challans: DispatchRow[]): DispatchRow | null {
  const sorted = [...(challans || [])].sort((a, b) => {
    const da = a.dispatch_date || a.created_at || "";
    const db = b.dispatch_date || b.created_at || "";
    return db.localeCompare(da);
  });
  const terminal = (challans || []).filter(
    (d) => d.status && TERMINAL_DISPATCH_STATUSES.has(d.status)
  );
  if (terminal.length > 0) {
    return [...terminal].sort((a, b) => {
      const da = a.dispatch_date || a.created_at || "";
      const db = b.dispatch_date || b.created_at || "";
      return db.localeCompare(da);
    })[0];
  }
  // Fallback: show latest challan even if not in terminal status.
  return sorted[0] || null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
}

export default function OrderCompletionReportPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<
    Array<{
      order: OrderRow;
      dispatch: DispatchRow | null;
      invoiceNumber: string | null;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from("orders")
        .select(
          `
          id,
          order_number,
          order_date,
          status,
          order_type,
          expected_delivery_date,
          customer:customers(company_name),
          dispatch_orders(
            id,
            dispatch_number,
            dispatch_date,
            created_at,
            status,
            courier_name,
            tracking_number,
            actual_delivery,
            estimated_delivery
          )
        `
        )
        .eq("is_deleted", false)
        .or("order_type.is.null,order_type.eq.custom")
        .order("order_date", { ascending: false });

      if (qErr) throw qErr;

      const list = (data || []) as unknown as OrderRow[];
      const orderIds = list.map((o) => o.id).filter(Boolean);
      let invoiceByOrderId: Record<string, string> = {};
      if (orderIds.length > 0) {
        const { data: invoiceRows } = await supabase
          .from("invoices")
          .select("id, order_id, invoice_number, created_at")
          .in("order_id", orderIds as any)
          .order("created_at", { ascending: false });

        for (const inv of (invoiceRows || []) as unknown as InvoiceRow[]) {
          if (!inv.order_id || !inv.invoice_number) continue;
          if (!invoiceByOrderId[inv.order_id]) {
            invoiceByOrderId[inv.order_id] = inv.invoice_number;
          }
        }
      }
      const filtered = list
        .filter(isMarkedDispatched)
        .map((order) => ({
          order,
          dispatch: pickLatestDispatch(order.dispatch_orders || []),
          invoiceNumber: invoiceByOrderId[order.id] || null,
        }));

      setRows(filtered);
    } catch (e: unknown) {
      console.error("Order completion report fetch:", e);
      setError(e instanceof Error ? e.message : "Failed to load orders");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const count = rows.length;

  const dispatchStatusLabel = useMemo(() => {
    return (d: DispatchRow | null) => {
      if (!d?.status) return "—";
      const s = d.status;
      if (s === "delivered") return "Delivered";
      if (s === "shipped") return "Shipped";
      if (s === "dispatched") return "Dispatched";
      return s.replace(/_/g, " ");
    };
  }, []);

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Button variant="ghost" onClick={() => navigate(-1)} className="mb-2 -ml-2">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Order Completion Report
            </h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
              <ClipboardList className="h-4 w-4 shrink-0" />
              Custom orders marked dispatched or with a shipped / delivered dispatch challan.
              <Badge variant="secondary">{count} order{count !== 1 ? "s" : ""}</Badge>
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchRows()} disabled={loading}>
            Refresh
          </Button>
        </div>

        <Card className="shadow-erp-md">
          <CardContent className="p-0 pt-0">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading orders…
              </div>
            ) : error ? (
              <div className="p-6 text-center text-destructive text-sm">{error}</div>
            ) : rows.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No dispatched custom orders yet. Orders appear here when status is{" "}
                <span className="font-medium text-foreground">Dispatched</span> or{" "}
                <span className="font-medium text-foreground">Completed</span>, or when a dispatch
                challan is marked shipped or delivered.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Order date</TableHead>
                      <TableHead>Order status</TableHead>
                      <TableHead>Dispatch #</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Dispatch date</TableHead>
                      <TableHead>Challan status</TableHead>
                      <TableHead>Courier</TableHead>
                      <TableHead>Tracking</TableHead>
                      <TableHead>Delivered</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(({ order, dispatch: d, invoiceNumber }) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">
                          <button
                            type="button"
                            className="text-primary hover:underline text-left"
                            onClick={() => navigate(`/orders/${order.id}`)}
                          >
                            {order.order_number}
                          </button>
                        </TableCell>
                        <TableCell>{order.customer?.company_name || "—"}</TableCell>
                        <TableCell>{formatDate(order.order_date)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {(order.status || "—").replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>{d?.dispatch_number || "—"}</TableCell>
                        <TableCell>{invoiceNumber || "—"}</TableCell>
                        <TableCell>{formatDate(d?.dispatch_date)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={d?.status === "delivered" ? "default" : "secondary"}
                            className="capitalize"
                          >
                            {dispatchStatusLabel(d)}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate" title={d?.courier_name || ""}>
                          {d?.courier_name || "—"}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate font-mono text-xs" title={d?.tracking_number || ""}>
                          {d?.tracking_number || "—"}
                        </TableCell>
                        <TableCell>{formatDate(d?.actual_delivery)}</TableCell>
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
