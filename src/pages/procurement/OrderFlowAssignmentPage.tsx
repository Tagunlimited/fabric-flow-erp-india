import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ErpLayout } from '@/components/ErpLayout';
import { BackButton } from '@/components/common/BackButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { assignOrderItemFlows } from '@/api/fulfillment/assignFlows';
import type { ExecutionFlow } from '@/domain/fulfillment/types';
import { EXECUTION_FLOWS, executionFlowLabel, fulfillmentStatusLabel } from '@/domain/fulfillment/types';
import {
  InventoryStockMappingPanel,
  hydrateStockMappings,
  inventoryPayloadFromMappings,
  mappingsMatchSizeRows,
  validateStockMappings,
  type StockSizeMapping,
} from '@/components/fulfillment/InventoryStockMappingPanel';
import { fetchStockProductCatalog, type StockProductRow } from '@/lib/stockFulfillmentCatalog';
import { chunkArray } from '@/lib/chunkArray';
import { getOrderLineSizeRows, parseOrderLineSpecifications } from '@/lib/orderLineSizes';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn, formatLocaleDateFromApi } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { getOrderItemListThumbnailUrl } from '@/utils/orderItemImageUtils';
import {
  isLineAwaitingAssignment,
  isLineReassignable,
  reassignBlockMessage,
} from '@/domain/fulfillment/reassign';
import type { AssignOrderItemFlowsMode } from '@/api/fulfillment/assignFlows';
import {
  describeLineFulfillmentNextStep,
  loadOutsourceLineContextsForOrder,
  type OutsourceLineContext,
} from '@/lib/outsourceFulfillment';

type QueueRow = {
  order_id: string;
  order_number: string;
  order_date: string | null;
  expected_delivery_date?: string | null;
  order_type: string | null;
  order_status: string | null;
  sales_manager?: string | null;
  final_amount?: number | null;
  balance_amount?: number | null;
  customer_id: string | null;
  customer_name: string | null;
  line_count: number | null;
  pending_line_count?: number | null;
  assigned_line_count?: number | null;
  flow_summary?: string | null;
  can_reassign?: boolean | null;
  reassign_block_reason?: string | null;
};

type QueueTab = 'awaiting' | 'assigned';

type QueueOrderPreview = {
  imageUrl: string | null;
  products: string;
  fabrics: string;
  sizes: string;
  qty: number;
};

type OrderLine = {
  id: string;
  quantity: number | null;
  sizes_quantities?: Record<string, unknown> | null;
  product_description?: string | null;
  product_id?: string | null;
  size_type_id?: string | null;
  execution_flow?: ExecutionFlow | null;
  fulfillment_status?: string | null;
  fabric_id?: string | null;
  color?: string | null;
  mockup_images?: string[] | null;
  specifications?: unknown;
  category_image_url?: string | null;
  fabric?: {
    id: string;
    fabric_name?: string | null;
    color?: string | null;
    gsm?: string | number | null;
  } | null;
};

function lineCardDisplay(
  line: OrderLine,
  orderMeta: { order_type?: string | null } | undefined
): { title: string; subtitleParts: string[]; imageUrl: string | null } {
  const specs = parseOrderLineSpecifications(line.specifications);
  const productName = String(specs.product_name || '').trim();
  const desc = String(line.product_description || '').trim();
  const title =
    productName ||
    desc ||
    String(line.fabric?.fabric_name || '').trim() ||
    'Line item';
  const fabric = String(line.fabric?.fabric_name || '').trim();
  const color =
    String(line.color || '').trim() ||
    String(line.fabric?.color || '').trim() ||
    String(specs.color || '').trim();
  const gsmRaw = line.fabric?.gsm;
  const gsm = gsmRaw !== undefined && gsmRaw !== null && String(gsmRaw).trim() !== '' ? `${String(gsmRaw).trim()} GSM` : '';
  const subtitleParts = [fabric, color, gsm].filter(Boolean);
  const imageUrl = getOrderItemListThumbnailUrl(line, orderMeta);
  return { title, subtitleParts, imageUrl };
}

function summarizeOrderLineForQueue(
  line: OrderLine,
  orderMeta: { order_type?: string | null } | undefined
): { imageUrl: string | null; product: string; fabric: string; sizeLabels: string[]; qty: number } {
  const specs = parseOrderLineSpecifications(line.specifications);
  const imageUrl = getOrderItemListThumbnailUrl(line, orderMeta);
  const product =
    String(specs.product_name || '').trim() ||
    String(line.product_description || '').trim() ||
    'Line item';
  const fabric = String(line.fabric?.fabric_name || '').trim();

  const sizeRows = getOrderLineSizeRows(specs, line.quantity, line.sizes_quantities);
  const sizeLabels = sizeRows.filter((r) => r.qty > 0).map((r) => r.size);
  const qty = sizeRows.reduce((sum, r) => sum + r.qty, 0);
  return { imageUrl, product, fabric, sizeLabels, qty };
}

type SalesManager = { id: string; full_name: string | null; avatar_url?: string | null };
type SizeTypeRow = {
  id: string;
  size_name: string;
  available_sizes: string[];
  size_order?: Record<string, number>;
};

const ORDER_NUMBER_PATTERN = /^(TUC|RMO)\/\d{2}-\d{2}\/\d+$/;
const FLOW_CARD_META: Record<
  ExecutionFlow,
  { subtitle: string; blobClass: string; fillClass: string; fillSelectedClass: string; badgeClass: string }
> = {
  stitching: {
    subtitle: 'Handled by in-house stitching team.',
    blobClass: 'bg-violet-500/80',
    fillClass: 'bg-blue-50 border-blue-200',
    fillSelectedClass: 'bg-blue-100 border-blue-300',
    badgeClass: 'bg-blue-600/15 text-blue-700',
  },
  outsource: {
    subtitle: 'Sent to an external vendor via PO.',
    blobClass: 'bg-amber-500/80',
    fillClass: 'bg-amber-50 border-amber-200',
    fillSelectedClass: 'bg-amber-100 border-amber-300',
    badgeClass: 'bg-amber-600/15 text-amber-700',
  },
  inventory: {
    subtitle: 'Fulfilled from available warehouse stock.',
    blobClass: 'bg-emerald-500/80',
    fillClass: 'bg-emerald-50 border-emerald-200',
    fillSelectedClass: 'bg-emerald-100 border-emerald-300',
    badgeClass: 'bg-emerald-600/15 text-emerald-700',
  },
};

/** PostgREST 404 / schema cache when the queue view was missing or not exposed to the API. */
function isPendingFlowViewMissing(e: unknown): boolean {
  const err = e as { code?: string; message?: string; status?: number; statusCode?: number; details?: string } | null;
  const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  if (status === 404) return true;
  const blob = `${String(err?.message || '')} ${String(err?.details || '')}`.toLowerCase();
  if (err?.code === '42P01' || err?.code === 'PGRST205') return true;
  if (blob.includes('v_orders_pending_flow_assignment')) {
    return (
      blob.includes('schema cache') ||
      blob.includes('does not exist') ||
      blob.includes('could not find') ||
      blob.includes('not found')
    );
  }
  const msg = String(err?.message || '').trim();
  if (status === 404 && (msg === '' || /^not found\.?$/i.test(msg))) return true;
  return false;
}

/**
 * Same rows as v_orders_pending_flow_assignment when the view is missing from PostgREST.
 * Mirrors view predicates in 20260506120000 / 20260507160000 migrations.
 */
async function fetchPendingFlowQueueFallback(): Promise<QueueRow[]> {
  const { data: cs, error: csErr } = await supabase
    .from('company_settings')
    .select('require_order_flow_assignment')
    .limit(1)
    .maybeSingle();
  if (csErr || !(cs as { require_order_flow_assignment?: boolean })?.require_order_flow_assignment) {
    return [];
  }

  const { data: pendingLines, error: plErr } = await supabase
    .from('order_items')
    .select('order_id')
    .or('fulfillment_status.eq.pending_flow,execution_flow.is.null');
  if (plErr) {
    console.warn('Order flow queue fallback: order_items failed', plErr);
    return [];
  }

  const orderIds = [...new Set((pendingLines || []).map((r: { order_id: string }) => r.order_id).filter(Boolean))];
  if (!orderIds.length) return [];

  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select(
      'id, order_number, order_date, expected_delivery_date, order_type, status, sales_manager, final_amount, balance_amount, customer_id, is_deleted, customer:customers(company_name)'
    )
    .in('id', orderIds)
    .not('status', 'in', '(cancelled,completed,ready_for_dispatch,dispatched)');
  if (oErr || !orders?.length) {
    if (oErr) console.warn('Order flow queue fallback: orders failed', oErr);
    return [];
  }

  const openOrders = (orders as any[]).filter((o) => !o?.is_deleted);
  if (!openOrders.length) return [];

  const byId = new Set<string>();
  for (const batch of chunkArray(
    openOrders.map((o) => o.id as string),
    80
  )) {
    const { data: rec, error } = await supabase
      .from('receipts')
      .select('reference_id, reference_type')
      .in('reference_id', batch);
    if (error) continue;
    for (const r of rec || []) {
      const row = r as { reference_id?: string; reference_type?: string | null };
      if (row.reference_id && String(row.reference_type || '').toLowerCase() === 'order') {
        byId.add(String(row.reference_id));
      }
    }
  }

  const distinctNumbers = [
    ...new Set(
      openOrders
        .map((o) => o.order_number)
        .filter((n): n is string => Boolean(n && ORDER_NUMBER_PATTERN.test(String(n))))
    ),
  ];
  const byNumber = new Set<string>();
  for (const batch of chunkArray(distinctNumbers, 80)) {
    if (!batch.length) continue;
    const { data: rec, error } = await supabase
      .from('receipts')
      .select('reference_number,reference_id,reference_type')
      .is('reference_id', null)
      .eq('reference_type', 'order')
      .in('reference_number', batch);
    if (error) continue;
    for (const r of rec || []) {
      const n = (r as { reference_number?: string }).reference_number;
      if (n) byNumber.add(String(n));
    }
  }

  const withReceipt = openOrders.filter(
    (o) => byId.has(String(o.id)) || (o.order_number && byNumber.has(String(o.order_number)))
  );
  if (!withReceipt.length) return [];

  const withReceiptIds = withReceipt.map((o) => String(o.id));
  const { data: bomRows, error: bomErr } = await supabase
    .from('bom_records')
    .select('order_id')
    .in('order_id', withReceiptIds);
  if (bomErr) {
    console.warn('Order flow queue fallback: bom_records failed', bomErr);
  }
  const ordersWithBom = new Set((bomRows || []).map((r: any) => String(r.order_id)).filter(Boolean));
  const eligibleOrders = withReceipt.filter((o) => !ordersWithBom.has(String(o.id)));
  if (!eligibleOrders.length) return [];

  const finalIds = eligibleOrders.map((o) => String(o.id));
  const { data: countRows, error: cErr } = await supabase
    .from('order_items')
    .select('order_id, fulfillment_status, execution_flow')
    .in('order_id', finalIds);
  if (cErr) console.warn('Order flow queue fallback: counts failed', cErr);

  const lineCount = new Map<string, number>();
  const pendingCount = new Map<string, number>();
  const startedCount = new Map<string, number>();
  for (const row of countRows || []) {
    const oid = String((row as { order_id: string }).order_id);
    lineCount.set(oid, (lineCount.get(oid) || 0) + 1);
    const rr = row as { fulfillment_status?: string; execution_flow?: string | null };
    if (rr.fulfillment_status === 'pending_flow' || !rr.execution_flow) {
      pendingCount.set(oid, (pendingCount.get(oid) || 0) + 1);
    }
    if (
      rr.execution_flow ||
      [
        'awaiting_procurement',
        'awaiting_production',
        'awaiting_dispatch_prep',
        'ready_for_dispatch',
        'dispatched',
      ].includes(String(rr.fulfillment_status || ''))
    ) {
      startedCount.set(oid, (startedCount.get(oid) || 0) + 1);
    }
  }

  const rows: QueueRow[] = eligibleOrders
    .filter((o) => (pendingCount.get(String(o.id)) || 0) > 0 && (startedCount.get(String(o.id)) || 0) === 0)
    .map((o: any) => ({
      order_id: o.id,
      order_number: o.order_number,
      order_date: o.order_date ?? null,
      expected_delivery_date: o.expected_delivery_date ?? null,
      order_type: o.order_type ?? null,
      order_status: o.status ?? null,
      sales_manager: o.sales_manager ?? null,
      final_amount: o.final_amount ?? null,
      balance_amount: o.balance_amount ?? null,
      customer_id: o.customer_id ?? null,
      customer_name: o.customer?.company_name ?? null,
      line_count: lineCount.get(String(o.id)) ?? 0,
      pending_line_count: pendingCount.get(String(o.id)) ?? 0,
    }));

  rows.sort((a, b) => {
    const ta = new Date(a.order_date || 0).getTime();
    const tb = new Date(b.order_date || 0).getTime();
    return tb - ta;
  });
  return rows;
}

function isAssignedFlowViewMissing(e: unknown): boolean {
  const err = e as { code?: string; message?: string; status?: number; statusCode?: number; details?: string } | null;
  const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  if (status === 404) return true;
  const blob = `${String(err?.message || '')} ${String(err?.details || '')}`.toLowerCase();
  if (err?.code === '42P01' || err?.code === 'PGRST205') return true;
  if (blob.includes('v_orders_flow_assigned')) {
    return (
      blob.includes('schema cache') ||
      blob.includes('does not exist') ||
      blob.includes('could not find') ||
      blob.includes('not found')
    );
  }
  const msg = String(err?.message || '').trim();
  if (status === 404 && (msg === '' || /^not found\.?$/i.test(msg))) return true;
  return false;
}

function flowSummaryFromLines(lines: { execution_flow?: string | null }[]): string {
  const counts = new Map<string, number>();
  for (const l of lines) {
    const f = String(l.execution_flow || '').trim();
    if (!f) continue;
    counts.set(f, (counts.get(f) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([f, n]) => `${f}: ${n}`)
    .join(', ');
}

async function fetchAssignedFlowQueueFallback(): Promise<QueueRow[]> {
  const { data: cs, error: csErr } = await supabase
    .from('company_settings')
    .select('require_order_flow_assignment')
    .limit(1)
    .maybeSingle();
  if (csErr || !(cs as { require_order_flow_assignment?: boolean })?.require_order_flow_assignment) {
    return [];
  }

  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select(
      'id, order_number, order_date, expected_delivery_date, order_type, status, sales_manager, final_amount, balance_amount, customer_id, is_deleted, customer:customers(company_name)'
    )
    .not('status', 'eq', 'cancelled');
  if (oErr || !orders?.length) return [];

  const openOrders = (orders as any[]).filter((o) => !o?.is_deleted);
  if (!openOrders.length) return [];

  const byId = new Set<string>();
  for (const batch of chunkArray(
    openOrders.map((o) => o.id as string),
    80
  )) {
    const { data: rec } = await supabase
      .from('receipts')
      .select('reference_id, reference_type')
      .in('reference_id', batch);
    for (const r of rec || []) {
      const row = r as { reference_id?: string; reference_type?: string | null };
      if (row.reference_id && String(row.reference_type || '').toLowerCase() === 'order') {
        byId.add(String(row.reference_id));
      }
    }
  }

  const distinctNumbers = [
    ...new Set(
      openOrders
        .map((o) => o.order_number)
        .filter((n): n is string => Boolean(n && ORDER_NUMBER_PATTERN.test(String(n))))
    ),
  ];
  const byNumber = new Set<string>();
  for (const batch of chunkArray(distinctNumbers, 80)) {
    if (!batch.length) continue;
    const { data: rec } = await supabase
      .from('receipts')
      .select('reference_number')
      .is('reference_id', null)
      .eq('reference_type', 'order')
      .in('reference_number', batch);
    for (const r of rec || []) {
      const n = (r as { reference_number?: string }).reference_number;
      if (n) byNumber.add(String(n));
    }
  }

  const withReceipt = openOrders.filter(
    (o) => byId.has(String(o.id)) || (o.order_number && byNumber.has(String(o.order_number)))
  );
  if (!withReceipt.length) return [];

  const orderIds = withReceipt.map((o) => String(o.id));
  const { data: lineRows } = await supabase
    .from('order_items')
    .select('order_id, execution_flow, fulfillment_status')
    .in('order_id', orderIds);

  const linesByOrder = new Map<string, { execution_flow?: string | null; fulfillment_status?: string | null }[]>();
  for (const row of lineRows || []) {
    const oid = String((row as { order_id: string }).order_id);
    const list = linesByOrder.get(oid) || [];
    list.push(row as { execution_flow?: string | null; fulfillment_status?: string | null });
    linesByOrder.set(oid, list);
  }

  const { data: bomRows } = await supabase.from('bom_records').select('order_id').in('order_id', orderIds);
  const ordersWithBom = new Set((bomRows || []).map((r: any) => String(r.order_id)));

  const { data: poRows } = await supabase.from('purchase_orders').select('sales_order_id').in('sales_order_id', orderIds);
  const ordersWithPo = new Set((poRows || []).map((r: any) => String(r.sales_order_id)).filter(Boolean));

  const rows: QueueRow[] = [];
  for (const o of withReceipt) {
    const oid = String(o.id);
    const lines = linesByOrder.get(oid) || [];
    if (!lines.length) continue;
    const hasPending = lines.some(
      (l) => l.fulfillment_status === 'pending_flow' || !l.execution_flow
    );
    const assignedCount = lines.filter((l) => l.execution_flow).length;
    if (hasPending || assignedCount === 0) continue;

    const allFlowAssigned = lines.every((l) => l.fulfillment_status === 'flow_assigned');
    let canReassign = allFlowAssigned && !ordersWithBom.has(oid) && !ordersWithPo.has(oid);
    let blockReason: string | null = null;
    if (!allFlowAssigned) {
      blockReason = 'One or more lines are not in flow_assigned state';
      canReassign = false;
    } else if (ordersWithBom.has(oid)) {
      blockReason = 'BOM already created for this order';
      canReassign = false;
    } else if (ordersWithPo.has(oid)) {
      blockReason = 'Purchase order already linked to this order';
      canReassign = false;
    }

    rows.push({
      order_id: o.id,
      order_number: o.order_number,
      order_date: o.order_date ?? null,
      expected_delivery_date: o.expected_delivery_date ?? null,
      order_type: o.order_type ?? null,
      order_status: o.status ?? null,
      sales_manager: o.sales_manager ?? null,
      final_amount: o.final_amount ?? null,
      balance_amount: o.balance_amount ?? null,
      customer_id: o.customer_id ?? null,
      customer_name: o.customer?.company_name ?? null,
      line_count: lines.length,
      assigned_line_count: assignedCount,
      flow_summary: flowSummaryFromLines(lines),
      can_reassign: canReassign,
      reassign_block_reason: blockReason,
    });
  }

  rows.sort((a, b) => {
    const ta = new Date(a.order_date || 0).getTime();
    const tb = new Date(b.order_date || 0).getTime();
    return tb - ta;
  });
  return rows;
}

type OrderFlowQueueTableProps = {
  rows: QueueRow[];
  variant: QueueTab;
  selectedOrderId: string | null;
  onSelect: (orderId: string) => void;
  queuePreviewByOrderId: Record<string, QueueOrderPreview>;
  salesManagers: Record<string, SalesManager>;
};

function OrderFlowQueueTable({
  rows,
  variant,
  selectedOrderId,
  onSelect,
  queuePreviewByOrderId,
  salesManagers,
}: OrderFlowQueueTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="align-middle min-w-[6.5rem]">
              <span className="text-xs font-semibold">Order #</span>
            </TableHead>
            <TableHead className="align-middle min-w-[7rem]">
              <span className="text-xs font-semibold">Reference</span>
            </TableHead>
            <TableHead className="align-middle min-w-[10rem]">
              <span className="text-xs font-semibold">Products</span>
            </TableHead>
            <TableHead className="align-middle min-w-[10rem]">
              <span className="text-xs font-semibold">Fabric</span>
            </TableHead>
            <TableHead className="align-middle min-w-[8rem]">
              <span className="text-xs font-semibold">Size</span>
            </TableHead>
            <TableHead className="align-middle min-w-[4rem] text-right">
              <span className="text-xs font-semibold">Qty</span>
            </TableHead>
            <TableHead className="align-middle min-w-[7rem]">
              <span className="text-xs font-semibold">Sales Mgr.</span>
            </TableHead>
            <TableHead className="align-middle min-w-[6.5rem]">
              <span className="text-xs font-semibold">Order date</span>
            </TableHead>
            <TableHead className="align-middle min-w-[6.5rem]">
              <span className="text-xs font-semibold">Exp. delivery</span>
            </TableHead>
            <TableHead className="align-middle min-w-[14rem] w-56 text-left">
              <span className="text-xs font-semibold">Status</span>
            </TableHead>
            <TableHead className="align-middle min-w-[6rem]">
              <span className="text-xs font-semibold">{variant === 'awaiting' ? 'Pending' : 'Flows'}</span>
            </TableHead>
            {variant === 'assigned' ? (
              <TableHead className="align-middle min-w-[7rem]">
                <span className="text-xs font-semibold">Re-assign</span>
              </TableHead>
            ) : null}
            <TableHead className="align-middle min-w-[5.5rem]">
              <span className="text-xs font-semibold">Amount</span>
            </TableHead>
            <TableHead className="align-middle min-w-[5.5rem]">
              <span className="text-xs font-semibold">Balance</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow
              key={r.order_id}
              className={cn('cursor-pointer', selectedOrderId === r.order_id && 'bg-muted/40')}
              onClick={() => onSelect(r.order_id)}
            >
              <TableCell className="font-medium">{r.order_number}</TableCell>
              <TableCell>
                {queuePreviewByOrderId[r.order_id]?.imageUrl ? (
                  <img
                    src={queuePreviewByOrderId[r.order_id]?.imageUrl || ''}
                    alt=""
                    className="h-12 w-12 rounded-md border border-border object-cover bg-muted"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-sm">{queuePreviewByOrderId[r.order_id]?.products || '—'}</TableCell>
              <TableCell className="text-sm">{queuePreviewByOrderId[r.order_id]?.fabrics || '—'}</TableCell>
              <TableCell className="text-sm">{queuePreviewByOrderId[r.order_id]?.sizes || '—'}</TableCell>
              <TableCell className="text-sm text-right font-medium tabular-nums">
                {queuePreviewByOrderId[r.order_id]?.qty
                  ? queuePreviewByOrderId[r.order_id].qty.toLocaleString('en-IN')
                  : '—'}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar className="w-10 h-10">
                    <AvatarImage
                      src={r.sales_manager ? salesManagers[r.sales_manager]?.avatar_url ?? undefined : undefined}
                      alt={r.sales_manager ? salesManagers[r.sales_manager]?.full_name ?? 'Sales manager' : 'Sales manager'}
                    />
                    <AvatarFallback className="text-xs">
                      {(r.sales_manager ? salesManagers[r.sales_manager]?.full_name : '')
                        ?.split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase() || 'SM'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{(r.sales_manager && salesManagers[r.sales_manager]?.full_name) || 'N/A'}</span>
                </div>
              </TableCell>
              <TableCell>
                {r.order_date
                  ? formatLocaleDateFromApi(r.order_date, 'en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: '2-digit',
                    })
                  : 'N/A'}
              </TableCell>
              <TableCell>
                {r.expected_delivery_date
                  ? formatLocaleDateFromApi(r.expected_delivery_date, 'en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: '2-digit',
                    })
                  : 'N/A'}
              </TableCell>
              <TableCell>
                <div className="text-sm">{r.order_status || 'pending'}</div>
              </TableCell>
              <TableCell>
                {variant === 'awaiting' ? (
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    {r.pending_line_count ?? 0}/{r.line_count ?? 0}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">{r.flow_summary || '—'}</span>
                )}
              </TableCell>
              {variant === 'assigned' ? (
                <TableCell>
                  {r.can_reassign ? (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200">
                      Available
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
                      Locked
                    </Badge>
                  )}
                </TableCell>
              ) : null}
              <TableCell>₹{Number(r.final_amount ?? 0).toFixed(2)}</TableCell>
              <TableCell>₹{Number(r.balance_amount ?? 0).toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const OrderFlowAssignmentPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderIdParam = searchParams.get('orderId');

  const [activeTab, setActiveTab] = useState<QueueTab>(
    searchParams.get('tab') === 'assigned' ? 'assigned' : 'awaiting'
  );
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [loadingAssignedQueue, setLoadingAssignedQueue] = useState(true);
  const [assignedQueue, setAssignedQueue] = useState<QueueRow[]>([]);
  const [assignedQueueLoadNotice, setAssignedQueueLoadNotice] = useState<string | null>(null);
  const [assignedReassignFilterActive, setAssignedReassignFilterActive] = useState(true);
  const [salesManagers, setSalesManagers] = useState<Record<string, SalesManager>>({});
  const [requireFlag, setRequireFlag] = useState(false);
  const [flagLoading, setFlagLoading] = useState(true);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(orderIdParam);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [choices, setChoices] = useState<Record<string, ExecutionFlow>>({});
  const [bulkAssignEnabled, setBulkAssignEnabled] = useState(false);
  const [bulkFlowChoice, setBulkFlowChoice] = useState<ExecutionFlow>('stitching');
  const [stockMappings, setStockMappings] = useState<Record<string, StockSizeMapping[]>>({});
  const [stockCatalog, setStockCatalog] = useState<StockProductRow[]>([]);
  const [stockCatalogLoading, setStockCatalogLoading] = useState(false);
  const [sizeTypes, setSizeTypes] = useState<SizeTypeRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [settingsSchemaError, setSettingsSchemaError] = useState<string | null>(null);
  const [queueLoadNotice, setQueueLoadNotice] = useState<string | null>(null);
  const [queuePreviewByOrderId, setQueuePreviewByOrderId] = useState<Record<string, QueueOrderPreview>>({});
  const [outsourceLineCtx, setOutsourceLineCtx] = useState<Record<string, OutsourceLineContext>>({});

  const isMissingRequireFlowColumn = (e: unknown) => {
    const err = e as { code?: string; message?: string } | null;
    if (err?.code === 'PGRST204') return true;
    const m = String(err?.message || '');
    return m.includes('require_order_flow_assignment');
  };

  const loadFlag = useCallback(async () => {
    setFlagLoading(true);
    setSettingsSchemaError(null);
    try {
      const { data, error } = await supabase.from('company_settings').select('require_order_flow_assignment').limit(1).maybeSingle();
      if (error) {
        if (isMissingRequireFlowColumn(error)) {
          setSettingsSchemaError(
            'The database is missing column company_settings.require_order_flow_assignment. Apply Supabase migrations (e.g. 20260507140000_ensure_company_settings_require_order_flow_assignment.sql), then in the Supabase dashboard reload the API schema cache under Project Settings → Data API.'
          );
          setRequireFlag(false);
          return;
        }
        throw error;
      }
      setRequireFlag(!!(data as any)?.require_order_flow_assignment);
    } catch (e) {
      console.error(e);
    } finally {
      setFlagLoading(false);
    }
  }, []);

  const saveFlag = async (next: boolean) => {
    try {
      const { data: row } = await supabase.from('company_settings').select('id').limit(1).maybeSingle();
      if (!row?.id) {
        toast.error('Company settings row not found');
        return;
      }
      const { error } = await supabase.from('company_settings').update({ require_order_flow_assignment: next } as any).eq('id', (row as any).id);
      if (error) {
        if (isMissingRequireFlowColumn(error)) {
          setSettingsSchemaError(
            'The database is missing column company_settings.require_order_flow_assignment. Apply Supabase migrations, then reload the API schema cache in the Supabase dashboard (Project Settings → Data API).'
          );
          toast.error('Database schema is out of date. Apply migrations, then reload the API schema.');
          return;
        }
        throw error;
      }
      setSettingsSchemaError(null);
      setRequireFlag(next);
      toast.success(next ? 'Flow assignment gate enabled' : 'Flow assignment gate disabled');
      await Promise.all([loadQueue(), loadAssignedQueue()]);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to update setting');
    }
  };

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    setQueueLoadNotice(null);
    try {
      const { data, error } = await supabase
        .from('v_orders_pending_flow_assignment' as any)
        .select('*')
        .order('order_date', { ascending: false });
      if (!error) {
        const rows = (data as QueueRow[]) || [];
        setQueue(rows);
        const managerIds = [...new Set(rows.map((r) => r.sales_manager).filter(Boolean))] as string[];
        if (!managerIds.length) {
          setSalesManagers({});
          return;
        }
        const { data: empRows } = await supabase
          .from('employees')
          .select('id, full_name, avatar_url')
          .in('id', managerIds);
        const map: Record<string, SalesManager> = {};
        for (const emp of empRows || []) {
          map[String((emp as any).id)] = {
            id: String((emp as any).id),
            full_name: (emp as any).full_name ?? null,
            avatar_url: (emp as any).avatar_url ?? null,
          };
        }
        setSalesManagers(map);
        return;
      }

      if (isPendingFlowViewMissing(error)) {
        const rows = await fetchPendingFlowQueueFallback();
        if (rows.length > 0) {
          console.warn('v_orders_pending_flow_assignment query failed; using client fallback', error);
          setQueue(rows);
          const managerIds = [...new Set(rows.map((r) => r.sales_manager).filter(Boolean))] as string[];
          if (managerIds.length) {
            const { data: empRows } = await supabase
              .from('employees')
              .select('id, full_name, avatar_url')
              .in('id', managerIds);
            const map: Record<string, SalesManager> = {};
            for (const emp of empRows || []) {
              map[String((emp as any).id)] = {
                id: String((emp as any).id),
                full_name: (emp as any).full_name ?? null,
                avatar_url: (emp as any).avatar_url ?? null,
              };
            }
            setSalesManagers(map);
          } else {
            setSalesManagers({});
          }
          setQueueLoadNotice(
            'The database view v_orders_pending_flow_assignment is missing or not in the API schema. Showing the same queue via a temporary client query. Apply migration 20260507160000_ensure_v_orders_pending_flow_assignment.sql (or the full fulfillment migrations), then reload the PostgREST schema in the Supabase dashboard.'
          );
          return;
        }
        console.warn('v_orders_pending_flow_assignment unavailable (empty queue)', error);
        setQueue([]);
        setSalesManagers({});
        setQueueLoadNotice(
          'The database view v_orders_pending_flow_assignment is missing or not in the API schema. Apply migration 20260507160000_ensure_v_orders_pending_flow_assignment.sql (or the full fulfillment migrations), then reload the PostgREST schema in the Supabase dashboard.'
        );
        return;
      }
      throw error;
    } catch (e) {
      console.error(e);
      setQueue([]);
      setSalesManagers({});
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  const hydrateSalesManagers = useCallback(async (rows: QueueRow[]) => {
    const managerIds = [...new Set(rows.map((r) => r.sales_manager).filter(Boolean))] as string[];
    if (!managerIds.length) {
      setSalesManagers({});
      return;
    }
    const { data: empRows } = await supabase
      .from('employees')
      .select('id, full_name, avatar_url')
      .in('id', managerIds);
    const map: Record<string, SalesManager> = {};
    for (const emp of empRows || []) {
      map[String((emp as any).id)] = {
        id: String((emp as any).id),
        full_name: (emp as any).full_name ?? null,
        avatar_url: (emp as any).avatar_url ?? null,
      };
    }
    setSalesManagers(map);
  }, []);

  const loadAssignedQueue = useCallback(async () => {
    setLoadingAssignedQueue(true);
    setAssignedQueueLoadNotice(null);
    try {
      const { data, error } = await supabase
        .from('v_orders_flow_assigned' as any)
        .select('*')
        .order('order_date', { ascending: false });
      if (!error) {
        const rows = (data as QueueRow[]) || [];
        setAssignedQueue(rows);
        await hydrateSalesManagers(rows);
        return;
      }

      if (isAssignedFlowViewMissing(error)) {
        const rows = await fetchAssignedFlowQueueFallback();
        if (rows.length > 0) {
          console.warn('v_orders_flow_assigned query failed; using client fallback', error);
          setAssignedQueue(rows);
          await hydrateSalesManagers(rows);
          setAssignedQueueLoadNotice(
            'The database view v_orders_flow_assigned is missing or not in the API schema. Showing the assigned queue via a temporary client query. Apply migration 20260529120000_order_flow_assigned_queue.sql, then reload the PostgREST schema in the Supabase dashboard.'
          );
          return;
        }
        setAssignedQueue([]);
        setAssignedQueueLoadNotice(
          'The database view v_orders_flow_assigned is missing or not in the API schema. Apply migration 20260529120000_order_flow_assigned_queue.sql, then reload the PostgREST schema in the Supabase dashboard.'
        );
        return;
      }
      throw error;
    } catch (e) {
      console.error(e);
      setAssignedQueue([]);
    } finally {
      setLoadingAssignedQueue(false);
    }
  }, [hydrateSalesManagers]);

  useEffect(() => {
    void loadFlag();
  }, [loadFlag]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue, requireFlag]);

  useEffect(() => {
    void loadAssignedQueue();
  }, [loadAssignedQueue, requireFlag]);

  useEffect(() => {
    if (!orderIdParam || loadingQueue || loadingAssignedQueue) return;
    if (queue.some((q) => q.order_id === orderIdParam)) {
      setActiveTab('awaiting');
      setSelectedOrderId(orderIdParam);
      return;
    }
    if (assignedQueue.some((q) => q.order_id === orderIdParam)) {
      setActiveTab('assigned');
      setSelectedOrderId(orderIdParam);
    }
  }, [orderIdParam, queue, assignedQueue, loadingQueue, loadingAssignedQueue]);

  const assignmentMode: AssignOrderItemFlowsMode = activeTab === 'assigned' ? 'reassign' : 'assign';
  const filteredAssignedQueue = useMemo(
    () =>
      assignedReassignFilterActive ? assignedQueue.filter((r) => r.can_reassign) : assignedQueue,
    [assignedQueue, assignedReassignFilterActive]
  );
  const selectedAssignedRow = assignedQueue.find((r) => r.order_id === selectedOrderId);
  const selectedCanReassign = assignmentMode === 'reassign' && !!selectedAssignedRow?.can_reassign;
  const reassignBlockReason = reassignBlockMessage(selectedAssignedRow?.reassign_block_reason);

  useEffect(() => {
    const loadQueuePreview = async () => {
      const orderIds = [...new Set([...queue, ...assignedQueue].map((q) => q.order_id).filter(Boolean))];
      if (!orderIds.length) {
        setQueuePreviewByOrderId({});
        return;
      }
      const { data, error } = await supabase
        .from('order_items')
        .select(
          `
          id,
          order_id,
          quantity,
          sizes_quantities,
          product_description,
          color,
          mockup_images,
          specifications,
          category_image_url,
          fabric:fabric_master(id, fabric_name, color, gsm)
        `
        )
        .in('order_id', orderIds as any);
      if (error) {
        console.error('Failed to load queue preview lines', error);
        return;
      }
      const byOrder: Record<string, QueueOrderPreview> = {};
      const previewOrders = [...queue, ...assignedQueue];
      for (const q of previewOrders) {
        const lines = ((data || []) as any[]).filter((l) => String(l.order_id) === q.order_id) as OrderLine[];
        const productSet = new Set<string>();
        const fabricSet = new Set<string>();
        const sizeSet = new Set<string>();
        let imageUrl: string | null = null;
        let totalQty = 0;
        for (const line of lines) {
          const summary = summarizeOrderLineForQueue(line, { order_type: q.order_type });
          if (!imageUrl && summary.imageUrl) imageUrl = summary.imageUrl;
          if (summary.product) productSet.add(summary.product);
          if (summary.fabric) fabricSet.add(summary.fabric);
          summary.sizeLabels.forEach((s) => sizeSet.add(s));
          totalQty += summary.qty;
        }
        byOrder[q.order_id] = {
          imageUrl,
          products: Array.from(productSet).join(', ') || '—',
          fabrics: Array.from(fabricSet).join(', ') || '—',
          sizes: Array.from(sizeSet).join(', ') || '—',
          qty: totalQty,
        };
      }
      setQueuePreviewByOrderId(byOrder);
    };
    void loadQueuePreview();
  }, [queue, assignedQueue]);

  const loadLines = useCallback(async (orderId: string) => {
    setLoadingLines(true);
    try {
      const { data, error } = await supabase
        .from('order_items')
        .select(
          `
          id,
          quantity,
          sizes_quantities,
          product_description,
          product_id,
          size_type_id,
          execution_flow,
          fulfillment_status,
          fabric_id,
          color,
          mockup_images,
          specifications,
          category_image_url,
          fabric:fabric_master(id, fabric_name, color, gsm)
        `
        )
        .eq('order_id', orderId);
      if (error) throw error;
      const lines = (data || []) as OrderLine[];
      setOrderLines(lines);
      const next: Record<string, ExecutionFlow> = {};
      const stockNext: Record<string, StockSizeMapping[]> = {};
      for (const l of lines) {
        next[l.id] = (l.execution_flow as ExecutionFlow) || 'stitching';
        if (l.execution_flow === 'inventory') {
          const specs = parseOrderLineSpecifications(l.specifications);
          const sizeRows = getOrderLineSizeRows(specs, l.quantity, l.sizes_quantities);
          stockNext[l.id] = hydrateStockMappings(sizeRows, l.specifications);
        }
      }
      setChoices(next);
      setStockMappings(stockNext);
      try {
        const ctx = await loadOutsourceLineContextsForOrder(orderId);
        setOutsourceLineCtx(ctx);
      } catch {
        setOutsourceLineCtx({});
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load order lines');
    } finally {
      setLoadingLines(false);
    }
  }, []);

  useEffect(() => {
    setBulkAssignEnabled(false);
    setBulkFlowChoice('stitching');
  }, [selectedOrderId]);

  useEffect(() => {
    if (selectedOrderId) void loadLines(selectedOrderId);
    else {
      setOrderLines([]);
      setChoices({});
      setStockMappings({});
    }
  }, [selectedOrderId, loadLines]);

  useEffect(() => {
    if (!selectedOrderId) return;
    let cancelled = false;
    const loadCatalog = async () => {
      setStockCatalogLoading(true);
      try {
        const [catalog, sizeTypeRes] = await Promise.all([
          fetchStockProductCatalog(),
          supabase.from('size_types').select('id, size_name, available_sizes, size_order'),
        ]);
        if (cancelled) return;
        setStockCatalog(catalog);
        if (!sizeTypeRes.error) {
          setSizeTypes((sizeTypeRes.data as SizeTypeRow[]) || []);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) toast.error('Failed to load stock product catalog');
      } finally {
        if (!cancelled) setStockCatalogLoading(false);
      }
    };
    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [selectedOrderId]);

  const ensureStockMappingsForLine = useCallback((line: OrderLine) => {
    setStockMappings((prev) => {
      const specs = parseOrderLineSpecifications(line.specifications);
      const sizeRows = getOrderLineSizeRows(specs, line.quantity, line.sizes_quantities);
      const existing = prev[line.id];
      if (existing && mappingsMatchSizeRows(existing, sizeRows)) return prev;
      return { ...prev, [line.id]: hydrateStockMappings(sizeRows, line.specifications) };
    });
  }, []);

  const handleStockMappingsChange = useCallback((lineId: string, mappings: StockSizeMapping[]) => {
    setStockMappings((prev) => ({ ...prev, [lineId]: mappings }));
  }, []);

  const pendingLines = useMemo(() => orderLines.filter(isLineAwaitingAssignment), [orderLines]);
  const dialogLines = assignmentMode === 'assign' ? pendingLines : orderLines;
  const dialogReadOnly = assignmentMode === 'reassign' && !selectedCanReassign;

  useEffect(() => {
    if (assignmentMode !== 'assign' || !selectedOrderId || loadingLines || saving) return;
    if (orderLines.length > 0 && pendingLines.length === 0) {
      setSelectedOrderId(null);
    }
  }, [assignmentMode, selectedOrderId, loadingLines, saving, orderLines.length, pendingLines.length]);

  useEffect(() => {
    for (const line of dialogLines) {
      const flow = bulkAssignEnabled ? bulkFlowChoice : choices[line.id];
      if (flow === 'inventory') ensureStockMappingsForLine(line);
    }
  }, [dialogLines, choices, bulkAssignEnabled, bulkFlowChoice, ensureStockMappingsForLine]);

  const assignmentDialogOrderMeta = useMemo(() => {
    const row = [...queue, ...assignedQueue].find((r) => r.order_id === selectedOrderId);
    return row ? { order_type: row.order_type } : undefined;
  }, [queue, assignedQueue, selectedOrderId]);
  const applyBulkFlowToAllLines = useCallback(
    (flow: ExecutionFlow) => {
      setChoices((prev) => {
        const next = { ...prev };
        for (const line of orderLines) next[line.id] = flow;
        return next;
      });
    },
    [orderLines]
  );

  const syncOrderItemProductForInventory = async (lineId: string, mappings: StockSizeMapping[]) => {
    const productIds = [...new Set(mappings.map((m) => m.productMasterId).filter(Boolean))];
    const product_id = productIds.length === 1 ? productIds[0]! : null;
    const { error } = await supabase.from('order_items').update({ product_id } as any).eq('id', lineId);
    if (error) throw error;
  };

  const persistStockFulfillmentSpecs = async (line: OrderLine, mappings: StockSizeMapping[]) => {
    const specs = parseOrderLineSpecifications(line.specifications);
    const stock_fulfillment = {
      mapped_at: new Date().toISOString(),
      by_size: mappings
        .filter((m) => m.productMasterId && m.wiId)
        .map((m) => ({
          order_size: m.orderSize,
          product_master_id: m.productMasterId,
          warehouse_inventory_id: m.wiId,
          quantity: Number(m.qty),
        })),
    };
    const { error } = await supabase
      .from('order_items')
      .update({ specifications: { ...specs, stock_fulfillment } } as any)
      .eq('id', line.id);
    if (error) console.warn('Could not save stock_fulfillment on order line specs', error);
  };

  const submitAssignments = async () => {
    if (!selectedOrderId || dialogReadOnly) return;
    const linesToSave =
      assignmentMode === 'assign'
        ? orderLines.filter(isLineAwaitingAssignment)
        : orderLines.filter(isLineReassignable);
    if (linesToSave.length === 0) {
      if (assignmentMode === 'assign') setSelectedOrderId(null);
      return;
    }

    for (const l of linesToSave) {
      const flow = bulkAssignEnabled ? bulkFlowChoice : choices[l.id] || 'stitching';
      if (flow !== 'inventory') continue;
      const mappings = stockMappings[l.id] || [];
      const err = validateStockMappings(mappings);
      if (err) {
        toast.error(err);
        return;
      }
    }

    setSaving(true);
    try {
      for (const l of linesToSave) {
        const flow = bulkAssignEnabled ? bulkFlowChoice : choices[l.id] || 'stitching';
        if (flow === 'inventory') {
          await syncOrderItemProductForInventory(l.id, stockMappings[l.id] || []);
        }
      }

      const assignments = linesToSave.map((l) => {
        const flow = bulkAssignEnabled ? bulkFlowChoice : choices[l.id] || 'stitching';
        const base: any = { order_item_id: l.id, execution_flow: flow };
        if (flow === 'inventory') {
          base.inventory = inventoryPayloadFromMappings(stockMappings[l.id] || []);
        }
        return base;
      });
      await assignOrderItemFlows(selectedOrderId, assignments, { mode: assignmentMode });

      await Promise.all(
        linesToSave
          .filter((l) => (bulkAssignEnabled ? bulkFlowChoice : choices[l.id]) === 'inventory')
          .map((l) => persistStockFulfillmentSpecs(l, stockMappings[l.id] || []))
      );

      toast.success(assignmentMode === 'reassign' ? 'Execution flows re-assigned' : 'Execution flows saved');
      setSelectedOrderId(null);
      await Promise.all([loadQueue(), loadAssignedQueue()]);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ErpLayout>
      <div className="w-full max-w-none space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <BackButton to="/procurement" label="Back to Procurement" />
        </div>

        <div>
          <h1 className="text-2xl font-bold text-[#101828]">Order flow assignment</h1>
          <p className="text-sm text-muted-foreground mt-1">
            After receipt, assign each order line to stitching, outsource, or inventory fulfillment.
          </p>
        </div>

        {settingsSchemaError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Database update required</AlertTitle>
            <AlertDescription className="text-sm">{settingsSchemaError}</AlertDescription>
          </Alert>
        )}

        {queueLoadNotice && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Awaiting queue view unavailable</AlertTitle>
            <AlertDescription className="text-sm">{queueLoadNotice}</AlertDescription>
          </Alert>
        )}

        {assignedQueueLoadNotice && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Assigned queue view unavailable</AlertTitle>
            <AlertDescription className="text-sm">{assignedQueueLoadNotice}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardContent className="pt-6">
            {flagLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <div className="flex items-center space-x-2">
                <Switch
                  checked={requireFlag}
                  onCheckedChange={(v) => void saveFlag(v)}
                  id="req-flow"
                  disabled={!!settingsSchemaError}
                />
                <Label htmlFor="req-flow" className="cursor-pointer">
                  Important
                </Label>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <Tabs
              value={activeTab}
              onValueChange={(v) => {
                setActiveTab(v as QueueTab);
                setSelectedOrderId(null);
              }}
            >
              <TabsList>
                <TabsTrigger value="awaiting">Awaiting assignment</TabsTrigger>
                <TabsTrigger value="assigned">Assigned</TabsTrigger>
              </TabsList>
              <TabsContent value="awaiting" className="mt-4">
                {loadingQueue ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : queue.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">
                    {requireFlag
                      ? 'No orders are waiting for flow assignment (requires a linked receipt).'
                      : 'Turn on “Require flow assignment” above to gate orders after receipt.'}
                  </p>
                ) : (
                  <OrderFlowQueueTable
                    rows={queue}
                    variant="awaiting"
                    selectedOrderId={selectedOrderId}
                    onSelect={setSelectedOrderId}
                    queuePreviewByOrderId={queuePreviewByOrderId}
                    salesManagers={salesManagers}
                  />
                )}
              </TabsContent>
              <TabsContent value="assigned" className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="assigned-reassign-filter"
                      checked={assignedReassignFilterActive}
                      onCheckedChange={setAssignedReassignFilterActive}
                    />
                    <Label htmlFor="assigned-reassign-filter" className="cursor-pointer">
                      Re-assign available only
                    </Label>
                  </div>
                  {assignedReassignFilterActive ? (
                    <span className="text-xs text-muted-foreground">
                      Showing orders where re-assign is allowed
                    </span>
                  ) : null}
                </div>
                {loadingAssignedQueue ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : assignedQueue.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">
                    {requireFlag
                      ? 'No orders with all lines assigned yet (requires a linked receipt).'
                      : 'Turn on “Require flow assignment” above to gate orders after receipt.'}
                  </p>
                ) : filteredAssignedQueue.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">
                    No orders with re-assign available. Turn off the filter to see locked orders.
                  </p>
                ) : (
                  <OrderFlowQueueTable
                    rows={filteredAssignedQueue}
                    variant="assigned"
                    selectedOrderId={selectedOrderId}
                    onSelect={setSelectedOrderId}
                    queuePreviewByOrderId={queuePreviewByOrderId}
                    salesManagers={salesManagers}
                  />
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Dialog open={!!selectedOrderId} onOpenChange={(open) => !open && setSelectedOrderId(null)}>
          <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {assignmentMode === 'reassign' ? 'Re-assign execution flows' : 'Assign execution flows'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              {loadingLines ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  {dialogReadOnly && reassignBlockReason ? (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Re-assign locked</AlertTitle>
                      <AlertDescription className="text-sm">{reassignBlockReason}</AlertDescription>
                    </Alert>
                  ) : null}
                  {assignmentMode === 'assign' && pendingLines.length === 0 && (
                    <p className="text-sm text-muted-foreground">All lines on this order already have a flow assigned.</p>
                  )}
                  {!dialogReadOnly && dialogLines.length > 0 && (
                    <div className="rounded-lg border border-border p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="bulk-flow-assignment"
                          checked={bulkAssignEnabled}
                          onCheckedChange={(checked) => {
                            const enabled = checked === true;
                            setBulkAssignEnabled(enabled);
                            if (enabled) {
                              applyBulkFlowToAllLines(bulkFlowChoice);
                            }
                          }}
                        />
                        <Label htmlFor="bulk-flow-assignment" className="text-sm font-medium cursor-pointer">
                          Assign a single flow for all products
                        </Label>
                      </div>
                      {bulkAssignEnabled && (
                        <RadioGroup
                          value={bulkFlowChoice}
                          onValueChange={(v) => {
                            const flow = v as ExecutionFlow;
                            setBulkFlowChoice(flow);
                            applyBulkFlowToAllLines(flow);
                            if (flow === 'inventory') {
                              for (const line of dialogLines) ensureStockMappingsForLine(line);
                            }
                          }}
                          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
                        >
                          {EXECUTION_FLOWS.map((f) => (
                            <Label
                              key={`bulk-${f}`}
                              htmlFor={`bulk-${f}`}
                              className={`group relative block cursor-pointer overflow-hidden rounded-2xl border p-1 transition-all ${
                                bulkFlowChoice === f ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/40'
                              }`}
                            >
                              <RadioGroupItem value={f} id={`bulk-${f}`} className="sr-only" />
                              <div className="pointer-events-none relative h-full min-h-[170px] rounded-[14px] bg-background">
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div
                                    className={`h-24 w-24 rounded-full blur-xl opacity-25 ${FLOW_CARD_META[f].blobClass}`}
                                    aria-hidden="true"
                                  />
                                </div>
                                <div
                                  className={`absolute inset-[6px] z-10 rounded-xl border p-3 ${
                                    bulkFlowChoice === f ? FLOW_CARD_META[f].fillSelectedClass : FLOW_CARD_META[f].fillClass
                                  }`}
                                >
                                  <div className="flex h-full flex-col justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-semibold text-foreground">{executionFlowLabel(f)}</p>
                                      <p className="mt-1 text-xs text-muted-foreground">{FLOW_CARD_META[f].subtitle}</p>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-muted-foreground">Tap to select</span>
                                      {bulkFlowChoice === f && (
                                        <span className={`rounded-full px-2 py-0.5 font-medium ${FLOW_CARD_META[f].badgeClass}`}>
                                          Selected
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </Label>
                          ))}
                        </RadioGroup>
                      )}
                    </div>
                  )}
                  {dialogLines.map((line) => {
                    const effectiveFlow = bulkAssignEnabled ? bulkFlowChoice : choices[line.id] || 'stitching';
                    const specs = parseOrderLineSpecifications(line.specifications);
                    const sizeRows = getOrderLineSizeRows(specs, line.quantity, line.sizes_quantities);
                    const lineStockMappings = (() => {
                      const existing = stockMappings[line.id];
                      if (existing && mappingsMatchSizeRows(existing, sizeRows)) return existing;
                      return hydrateStockMappings(sizeRows, line.specifications);
                    })();
                    const sizeTypeId =
                      line.size_type_id || (specs.size_type_id as string | undefined) || null;
                    const { title, subtitleParts, imageUrl } = lineCardDisplay(line, assignmentDialogOrderMeta);
                    return (
                    <div key={line.id} className="rounded-lg border border-border p-4 space-y-3">
                      <div className="flex flex-wrap justify-between gap-2">
                        <div className="flex gap-3 min-w-0 flex-1">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt=""
                              className="h-12 w-12 shrink-0 rounded-md border border-border object-cover bg-muted"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <p className="font-medium truncate">{title}</p>
                            <p className="text-xs text-muted-foreground">
                              Qty {line.quantity ?? '—'} · {fulfillmentStatusLabel(line.fulfillment_status as any)}
                            </p>
                            <p className="text-xs font-medium text-primary mt-0.5">
                              {describeLineFulfillmentNextStep(
                                (dialogReadOnly
                                  ? line.execution_flow
                                  : choices[line.id] || line.execution_flow) as ExecutionFlow,
                                line.fulfillment_status as any,
                                outsourceLineCtx[line.id]
                              )}
                            </p>
                            {subtitleParts.length > 0 ? (
                              <p className="text-xs text-muted-foreground mt-0.5">{subtitleParts.join(' · ')}</p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      {dialogReadOnly ? (
                        <p className="text-sm text-muted-foreground">
                          Current flow:{' '}
                          <span className="font-medium">{executionFlowLabel(line.execution_flow as ExecutionFlow)}</span>
                        </p>
                      ) : !bulkAssignEnabled ? (
                      <RadioGroup
                        value={choices[line.id] || 'stitching'}
                        onValueChange={(v) => {
                          const flow = v as ExecutionFlow;
                          setChoices((c) => ({ ...c, [line.id]: flow }));
                          if (flow === 'inventory') ensureStockMappingsForLine(line);
                        }}
                        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
                        disabled={dialogReadOnly}
                      >
                        {EXECUTION_FLOWS.map((f) => (
                          <Label
                            key={f}
                            htmlFor={`${line.id}-${f}`}
                            className={`group relative block cursor-pointer overflow-hidden rounded-2xl border p-1 transition-all ${
                              (choices[line.id] || 'stitching') === f
                                ? 'border-primary ring-2 ring-primary/30'
                                : 'border-border hover:border-primary/40'
                            }`}
                          >
                            <RadioGroupItem value={f} id={`${line.id}-${f}`} className="sr-only" />
                            <div className="pointer-events-none relative h-full min-h-[170px] rounded-[14px] bg-background">
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div
                                  className={`h-24 w-24 rounded-full blur-xl opacity-25 ${FLOW_CARD_META[f].blobClass}`}
                                  aria-hidden="true"
                                />
                              </div>
                              <div
                                className={`absolute inset-[6px] z-10 rounded-xl border p-3 ${
                                  (choices[line.id] || 'stitching') === f ? FLOW_CARD_META[f].fillSelectedClass : FLOW_CARD_META[f].fillClass
                                }`}
                              >
                                <div className="flex h-full flex-col justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">{executionFlowLabel(f)}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{FLOW_CARD_META[f].subtitle}</p>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">Tap to select</span>
                                    {(choices[line.id] || 'stitching') === f && (
                                      <span className={`rounded-full px-2 py-0.5 font-medium ${FLOW_CARD_META[f].badgeClass}`}>
                                        Selected
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </Label>
                        ))}
                      </RadioGroup>
                      ) : !dialogReadOnly ? (
                        <p className="text-xs text-muted-foreground">
                          Flow for all lines: <span className="font-medium">{executionFlowLabel(effectiveFlow)}</span>
                        </p>
                      ) : null}
                      {!dialogReadOnly && effectiveFlow === 'inventory' ? (
                        <InventoryStockMappingPanel
                          lineId={line.id}
                          sizeRows={sizeRows}
                          sizeTypeId={sizeTypeId}
                          sizeTypes={sizeTypes}
                          catalog={stockCatalog}
                          catalogLoading={stockCatalogLoading}
                          mappings={lineStockMappings}
                          onChange={handleStockMappingsChange}
                        />
                      ) : null}
                      {!bulkAssignEnabled &&
                        (choices[line.id] === 'outsource' || line.execution_flow === 'outsource') &&
                        (outsourceLineCtx[line.id]?.phase === 'awaiting_po' ||
                          (!outsourceLineCtx[line.id] && !dialogReadOnly && choices[line.id] === 'outsource')) && (
                        <div className="text-sm">
                          <Button
                            type="button"
                            variant="link"
                            className="h-auto p-0"
                            onClick={() =>
                              navigate(
                                `/procurement/po/new?mode=outsource&sales_order_id=${selectedOrderId}&sales_order_item_id=${line.id}`
                              )
                            }
                          >
                            Open purchase order for this line
                          </Button>
                        </div>
                      )}
                      {!bulkAssignEnabled &&
                        line.execution_flow === 'outsource' &&
                        outsourceLineCtx[line.id]?.phase === 'awaiting_grn' &&
                        outsourceLineCtx[line.id]?.po_id && (
                        <div className="text-sm">
                          <Button
                            type="button"
                            variant="link"
                            className="h-auto p-0"
                            onClick={() =>
                              navigate(`/procurement/grn/new?po=${outsourceLineCtx[line.id]?.po_id}`)
                            }
                          >
                            Create GRN for linked purchase order
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                  })}
                  {!dialogReadOnly && dialogLines.length > 0 && (
                    <Button onClick={() => void submitAssignments()} disabled={saving}>
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : assignmentMode === 'reassign' ? (
                        'Save re-assignment'
                      ) : (
                        'Save assignments'
                      )}
                    </Button>
                  )}
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ErpLayout>
  );
};

export default OrderFlowAssignmentPage;
