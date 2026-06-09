import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, startOfDay, endOfDay } from "date-fns";
import { ArrowLeft, Loader2, Printer, Shirt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DateRangeFilter } from "@/components/reports/DateRangeFilter";
import { rangeForPreset } from "@/components/reports/dateRangeUtils";
import type { ReportDateRange } from "@/components/reports/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useSizeTypes } from "@/hooks/useSizeTypes";
import { parseLineOrderItemIdFromNotes } from "@/utils/orderBatchAssignmentLine";
import { getOrderItemDisplayImage } from "@/utils/orderItemImageUtils";
import { sortSizeDistributionsByMasterOrder } from "@/utils/sizeSorting";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export interface TailorPaymentBatchSummaryRow {
  batch_id: string;
  batch_name: string;
  opening_pending: number;
  assigned_in_range: number;
  picked_in_range: number;
  sn_amount: number;
  of_amount: number;
  total_payable: number;
  approval_status: string;
}

export interface TailorPaymentDetailRow {
  order_batch_assignment_id: string;
  order_id: string;
  order_number: string;
  size_name: string;
  assigned_quantity: number;
  picked_quantity: number;
  picked_in_range: number;
  sn_rate_per_pc: number;
  of_rate_per_pc: number;
  sn_line_amount: number;
  of_line_amount: number;
  notes: string | null;
}

function statusVariant(
  s: string
): "default" | "secondary" | "outline" | "destructive" {
  if (s === "approved") return "default";
  if (s === "pending_approval") return "secondary";
  return "outline";
}

export default function TailorPaymentReportPage() {
  const { toast } = useToast();
  const { sizeTypes } = useSizeTypes();
  const initialRange = useMemo(() => {
    const { from, to } = rangeForPreset("this_month");
    return { from, to, preset: "this_month" as const };
  }, []);
  const [dateRange, setDateRange] = useState<ReportDateRange>(initialRange);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TailorPaymentBatchSummaryRow[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<TailorPaymentBatchSummaryRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRows, setDetailRows] = useState<TailorPaymentDetailRow[]>([]);
  const [assignmentImages, setAssignmentImages] = useState<Map<string, string | null>>(
    () => new Map()
  );
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const periodDates = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return null;
    return {
      periodStart: format(dateRange.from, "yyyy-MM-dd"),
      periodEnd: format(dateRange.to, "yyyy-MM-dd"),
      tsStart: startOfDay(dateRange.from).toISOString(),
      tsEnd: endOfDay(dateRange.to).toISOString(),
    };
  }, [dateRange.from, dateRange.to]);

  const loadSummary = useCallback(async () => {
    if (!periodDates) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("tailor_payment_batch_summary", {
        p_period_start: periodDates.periodStart,
        p_period_end: periodDates.periodEnd,
        p_ts_start: periodDates.tsStart,
        p_ts_end: periodDates.tsEnd,
      });
      if (error) throw error;
      setRows((data || []) as TailorPaymentBatchSummaryRow[]);
    } catch (e: unknown) {
      console.error(e);
      toast({
        title: "Could not load report",
        description: e instanceof Error ? e.message : "Check database migration and RPC.",
        variant: "destructive",
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [periodDates, toast]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const openDetail = async (batch: TailorPaymentBatchSummaryRow) => {
    if (!periodDates) return;
    setSelectedBatch(batch);
    setSheetOpen(true);
    setDetailLoading(true);
    setDetailRows([]);
    setAssignmentImages(new Map());
    try {
      const { data, error } = await (supabase as any).rpc("tailor_payment_batch_detail", {
        p_batch_id: batch.batch_id,
        p_ts_start: periodDates.tsStart,
        p_ts_end: periodDates.tsEnd,
      });
      if (error) throw error;
      const list = (data || []) as TailorPaymentDetailRow[];
      setDetailRows(list);

      const metaByAssignment = new Map<string, { order_id: string; notes: string | null }>();
      for (const r of list) {
        if (!metaByAssignment.has(r.order_batch_assignment_id)) {
          metaByAssignment.set(r.order_batch_assignment_id, {
            order_id: r.order_id,
            notes: r.notes,
          });
        }
      }
      const imgMap = new Map<string, string | null>();
      for (const [aid, meta] of metaByAssignment) {
        const lineId = parseLineOrderItemIdFromNotes(meta.notes);
        let image: string | null = null;
        if (lineId) {
          const { data: oi } = await (supabase as any)
            .from("order_items")
            .select("id, specifications, category_image_url, mockup_images")
            .eq("id", lineId)
            .maybeSingle();
          image = getOrderItemDisplayImage(oi);
        } else {
          const { data: items } = await (supabase as any)
            .from("order_items")
            .select("id, specifications, category_image_url, mockup_images")
            .eq("order_id", meta.order_id)
            .limit(1);
          const oi = items?.[0];
          image = getOrderItemDisplayImage(oi);
        }
        imgMap.set(aid, image);
      }
      setAssignmentImages(imgMap);
    } catch (e: unknown) {
      console.error(e);
      toast({
        title: "Detail failed",
        description: e instanceof Error ? e.message : "Could not load batch detail.",
        variant: "destructive",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const groupedDetail = useMemo(() => {
    const m = new Map<string, TailorPaymentDetailRow[]>();
    for (const r of detailRows) {
      const arr = m.get(r.order_batch_assignment_id) || [];
      arr.push(r);
      m.set(r.order_batch_assignment_id, arr);
    }
    for (const [aid, sizes] of m) {
      m.set(aid, sortSizeDistributionsByMasterOrder(sizes, null, sizeTypes));
    }
    return m;
  }, [detailRows, sizeTypes]);

  const handleApprove = async (batch: TailorPaymentBatchSummaryRow) => {
    if (!periodDates) return;
    setApprovingId(batch.batch_id);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const snapshot = {
        batch_id: batch.batch_id,
        batch_name: batch.batch_name,
        opening_pending: batch.opening_pending,
        assigned_in_range: batch.assigned_in_range,
        picked_in_range: batch.picked_in_range,
        sn_amount: batch.sn_amount,
        of_amount: batch.of_amount,
        total_payable: batch.total_payable,
        period_start: periodDates.periodStart,
        period_end: periodDates.periodEnd,
      };
      const { error } = await (supabase as any).from("tailor_payment_batch_approvals").insert({
        batch_id: batch.batch_id,
        period_start: periodDates.periodStart,
        period_end: periodDates.periodEnd,
        snapshot_jsonb: snapshot,
        status: "approved",
        approved_by: uid,
        approved_at: new Date().toISOString(),
      });
      if (error) {
        if (/duplicate|unique/i.test(String(error.message))) {
          toast({
            title: "Already approved",
            description: "This batch and period were already marked approved.",
          });
        } else {
          throw error;
        }
      } else {
        toast({ title: "Approved for payments", description: batch.batch_name });
        await loadSummary();
      }
    } catch (e: unknown) {
      console.error(e);
      toast({
        title: "Approve failed",
        description: e instanceof Error ? e.message : "Could not save approval.",
        variant: "destructive",
      });
    } finally {
      setApprovingId(null);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const rangeLabel =
    dateRange.from && dateRange.to
      ? `${format(dateRange.from, "dd MMM yyyy")} – ${format(dateRange.to, "dd MMM yyyy")}`
      : "";

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #tailor-payment-print-root, #tailor-payment-print-root * { visibility: visible; }
          #tailor-payment-print-root { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>

      <main className="w-full max-w-none space-y-4 bg-background p-4 sm:p-5 lg:p-6 print:p-4">
        <div className="print:hidden">
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2 gap-1 text-muted-foreground">
            <Link to="/reports">
              <ArrowLeft className="h-4 w-4" />
              Reports hub
            </Link>
          </Button>
          <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Shirt className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Tailor payment report
                </h1>
                <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
                  Batch-level picked-in-range totals and SN / OF piece rates from cutting assignment. Pick history
                  exists only from ledger go-live; older picks have no per-day split.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter variant="toolbar" value={dateRange} onChange={setDateRange} />
              <Button type="button" variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
                <Printer className="h-4 w-4" />
                Print
              </Button>
            </div>
          </header>
        </div>

        <div id="tailor-payment-print-root" className="space-y-3">
          <p className="text-xs text-muted-foreground print:text-foreground">
            Period: <span className="font-medium text-foreground">{rangeLabel}</span>
          </p>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
              <h2 className="text-base font-semibold text-foreground">Batches</h2>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" />
              ) : (
                <span className="text-sm text-muted-foreground tabular-nums">{rows.length} batches</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead className="text-right">Opening pending</TableHead>
                    <TableHead className="text-right">Assigned in range</TableHead>
                    <TableHead className="text-right">Picked in range</TableHead>
                    <TableHead className="text-right">SN</TableHead>
                    <TableHead className="text-right">OF</TableHead>
                    <TableHead className="text-right">Total payable</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="print:hidden w-[1%] whitespace-nowrap text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && !loading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                        No batch assignments in range, or RPC not available yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {rows.map((r) => (
                    <TableRow key={r.batch_id} className="cursor-pointer" onClick={() => void openDetail(r)}>
                      <TableCell className="font-medium">{r.batch_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.opening_pending}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.assigned_in_range}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.picked_in_range}</TableCell>
                      <TableCell className="text-right tabular-nums">{INR.format(Number(r.sn_amount) || 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">{INR.format(Number(r.of_amount) || 0)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {INR.format(Number(r.total_payable) || 0)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Badge variant={statusVariant(r.approval_status)} className="capitalize">
                          {r.approval_status === "pending_approval"
                            ? "Pending"
                            : r.approval_status === "approved"
                              ? "Approved"
                              : "Draft"}
                        </Badge>
                      </TableCell>
                      <TableCell className="print:hidden text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="outline" size="sm" onClick={() => void openDetail(r)}>
                            Detail
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={
                              r.approval_status === "approved" || approvingId === r.batch_id || !periodDates
                            }
                            onClick={() => void handleApprove(r)}
                          >
                            {approvingId === r.batch_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Approve"
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="flex w-full flex-col overflow-hidden sm:max-w-xl print:hidden">
            <SheetHeader>
              <SheetTitle>{selectedBatch?.batch_name ?? "Batch detail"}</SheetTitle>
              <p className="text-xs text-muted-foreground">{rangeLabel}</p>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {detailLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-6 py-2">
                  {[...groupedDetail.entries()].map(([aid, sizes]) => {
                    const first = sizes[0];
                    const img = assignmentImages.get(aid);
                    const snTotal = sizes.reduce((sum, s) => sum + (Number(s.sn_line_amount) || 0), 0);
                    const ofTotal = sizes.reduce((sum, s) => sum + (Number(s.of_line_amount) || 0), 0);
                    return (
                      <div key={aid} className="rounded-lg border border-border bg-muted/20 p-3">
                        <div className="mb-3 flex flex-col gap-3 sm:flex-row">
                          <div className="flex h-36 w-full shrink-0 items-center justify-center overflow-hidden rounded-md bg-background sm:h-28 sm:w-28">
                            {img ? (
                              <img src={img} alt="" className="max-h-full max-w-full object-contain" />
                            ) : (
                              <span className="text-xs text-muted-foreground">No image</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground">Order {first?.order_number}</p>
                            <p className="truncate text-xs text-muted-foreground">Assignment {aid.slice(0, 8)}…</p>
                          </div>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Size</TableHead>
                              <TableHead className="text-right">Assigned</TableHead>
                              <TableHead className="text-right">Picked</TableHead>
                              <TableHead className="text-right">In range</TableHead>
                              <TableHead className="text-right">SN/pc</TableHead>
                              <TableHead className="text-right">OF/pc</TableHead>
                              <TableHead className="text-right">SN ₹</TableHead>
                              <TableHead className="text-right">OF ₹</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sizes.map((s) => (
                              <TableRow key={`${aid}-${s.size_name}`}>
                                <TableCell>{s.size_name}</TableCell>
                                <TableCell className="text-right tabular-nums">{s.assigned_quantity}</TableCell>
                                <TableCell className="text-right tabular-nums">{s.picked_quantity}</TableCell>
                                <TableCell className="text-right tabular-nums">{s.picked_in_range}</TableCell>
                                <TableCell className="text-right tabular-nums">{Number(s.sn_rate_per_pc) || 0}</TableCell>
                                <TableCell className="text-right tabular-nums">{Number(s.of_rate_per_pc) || 0}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {INR.format(Number(s.sn_line_amount) || 0)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {INR.format(Number(s.of_line_amount) || 0)}
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="bg-muted/40 font-medium">
                              <TableCell colSpan={6}>Total</TableCell>
                              <TableCell className="text-right tabular-nums">{INR.format(snTotal)}</TableCell>
                              <TableCell className="text-right tabular-nums">{INR.format(ofTotal)}</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {selectedBatch && periodDates ? (
              <div className="border-t border-border pt-3 print:hidden">
                <Button
                  className="w-full"
                  disabled={selectedBatch.approval_status === "approved" || approvingId === selectedBatch.batch_id}
                  onClick={() => void handleApprove(selectedBatch)}
                >
                  Approve for payments ({periodDates.periodStart} → {periodDates.periodEnd})
                </Button>
              </div>
            ) : null}
          </SheetContent>
        </Sheet>
      </main>
    </>
  );
}
