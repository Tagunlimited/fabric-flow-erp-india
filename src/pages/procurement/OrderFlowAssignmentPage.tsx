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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { assignOrderItemFlows } from '@/api/fulfillment/assignFlows';
import type { ExecutionFlow } from '@/domain/fulfillment/types';
import { EXECUTION_FLOWS, executionFlowLabel, fulfillmentStatusLabel } from '@/domain/fulfillment/types';
import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type QueueRow = {
  order_id: string;
  order_number: string;
  order_date: string | null;
  order_type: string | null;
  order_status: string | null;
  customer_id: string | null;
  customer_name: string | null;
  line_count: number | null;
  pending_line_count: number | null;
};

type OrderLine = {
  id: string;
  quantity: number | null;
  product_description?: string | null;
  product_id?: string | null;
  execution_flow?: ExecutionFlow | null;
  fulfillment_status?: string | null;
};

type WiRow = { id: string; quantity: number; item_name: string | null };

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

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
    .eq('fulfillment_status', 'pending_flow');
  if (plErr) {
    console.warn('Order flow queue fallback: order_items failed', plErr);
    return [];
  }

  const orderIds = [...new Set((pendingLines || []).map((r: { order_id: string }) => r.order_id).filter(Boolean))];
  if (!orderIds.length) return [];

  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('id, order_number, order_date, order_type, status, customer_id, is_deleted, customer:customers(company_name)')
    .in('id', orderIds)
    .neq('status', 'cancelled');
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

  const distinctNumbers = [...new Set(openOrders.map((o) => o.order_number).filter(Boolean))] as string[];
  const byNumber = new Set<string>();
  for (const batch of chunkArray(distinctNumbers, 80)) {
    if (!batch.length) continue;
    const { data: rec, error } = await supabase.from('receipts').select('reference_number').in('reference_number', batch);
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

  const finalIds = withReceipt.map((o) => String(o.id));
  const { data: countRows, error: cErr } = await supabase
    .from('order_items')
    .select('order_id, fulfillment_status')
    .in('order_id', finalIds);
  if (cErr) console.warn('Order flow queue fallback: counts failed', cErr);

  const lineCount = new Map<string, number>();
  const pendingCount = new Map<string, number>();
  for (const row of countRows || []) {
    const oid = String((row as { order_id: string }).order_id);
    lineCount.set(oid, (lineCount.get(oid) || 0) + 1);
    if ((row as { fulfillment_status?: string }).fulfillment_status === 'pending_flow') {
      pendingCount.set(oid, (pendingCount.get(oid) || 0) + 1);
    }
  }

  const rows: QueueRow[] = withReceipt
    .filter((o) => (pendingCount.get(String(o.id)) || 0) > 0)
    .map((o: any) => ({
      order_id: o.id,
      order_number: o.order_number,
      order_date: o.order_date ?? null,
      order_type: o.order_type ?? null,
      order_status: o.status ?? null,
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

const OrderFlowAssignmentPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderIdParam = searchParams.get('orderId');

  const [loadingQueue, setLoadingQueue] = useState(true);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [requireFlag, setRequireFlag] = useState(false);
  const [flagLoading, setFlagLoading] = useState(true);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(orderIdParam);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [choices, setChoices] = useState<Record<string, ExecutionFlow>>({});
  const [invPick, setInvPick] = useState<Record<string, { wiId: string; qty: string }[]>>({});
  const [wiOptions, setWiOptions] = useState<Record<string, WiRow[]>>({});
  const [saving, setSaving] = useState(false);
  const [settingsSchemaError, setSettingsSchemaError] = useState<string | null>(null);
  const [queueLoadNotice, setQueueLoadNotice] = useState<string | null>(null);

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
      await loadQueue();
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
        setQueue((data as QueueRow[]) || []);
        return;
      }

      const rows = await fetchPendingFlowQueueFallback();
      if (rows.length > 0) {
        console.warn('v_orders_pending_flow_assignment query failed; using client fallback', error);
        setQueue(rows);
        setQueueLoadNotice(
          'The database view v_orders_pending_flow_assignment is missing or not in the API schema. Showing the same queue via a temporary client query. Apply migration 20260507160000_ensure_v_orders_pending_flow_assignment.sql (or the full fulfillment migrations), then reload the PostgREST schema in the Supabase dashboard.'
        );
        return;
      }
      if (isPendingFlowViewMissing(error)) {
        console.warn('v_orders_pending_flow_assignment unavailable (empty queue)', error);
        setQueue([]);
        setQueueLoadNotice(
          'The database view v_orders_pending_flow_assignment is missing or not in the API schema. Apply migration 20260507160000_ensure_v_orders_pending_flow_assignment.sql (or the full fulfillment migrations), then reload the PostgREST schema in the Supabase dashboard.'
        );
        return;
      }
      throw error;
    } catch (e) {
      console.error(e);
      setQueue([]);
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  useEffect(() => {
    void loadFlag();
  }, [loadFlag]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue, requireFlag]);

  const loadLines = useCallback(async (orderId: string) => {
    setLoadingLines(true);
    try {
      const { data, error } = await supabase
        .from('order_items')
        .select('id, quantity, product_description, product_id, execution_flow, fulfillment_status')
        .eq('order_id', orderId);
      if (error) throw error;
      const lines = (data || []) as OrderLine[];
      setOrderLines(lines);
      const next: Record<string, ExecutionFlow> = {};
      for (const l of lines) {
        next[l.id] = (l.execution_flow as ExecutionFlow) || 'stitching';
      }
      setChoices(next);
      setInvPick({});
    } catch (e) {
      console.error(e);
      toast.error('Failed to load order lines');
    } finally {
      setLoadingLines(false);
    }
  }, []);

  useEffect(() => {
    if (selectedOrderId) void loadLines(selectedOrderId);
    else {
      setOrderLines([]);
      setChoices({});
    }
  }, [selectedOrderId, loadLines]);

  const loadWiForLine = async (line: OrderLine) => {
    const pid = line.product_id;
    if (!pid) {
      toast.error('This line has no product_id; inventory path needs a product.');
      return;
    }
    const { data, error } = await supabase
      .from('warehouse_inventory')
      .select('id, quantity, item_name')
      .eq('item_type', 'PRODUCT')
      .eq('item_id', pid)
      .in('status', ['IN_STORAGE', 'READY_TO_DISPATCH'] as any)
      .limit(50);
    if (error) {
      console.error(error);
      toast.error('Failed to load warehouse stock');
      return;
    }
    setWiOptions((prev) => ({ ...prev, [line.id]: (data as WiRow[]) || [] }));
  };

  const pendingLines = useMemo(() => orderLines.filter((l) => l.fulfillment_status === 'pending_flow'), [orderLines]);

  const submitAssignments = async () => {
    if (!selectedOrderId) return;
    const linesToSave = orderLines.filter((l) => l.fulfillment_status === 'pending_flow');
    if (linesToSave.length === 0) {
      toast.info('No lines are pending flow assignment on this order.');
      return;
    }
    setSaving(true);
    try {
      const assignments = linesToSave.map((l) => {
        const flow = choices[l.id] || 'stitching';
        const base: any = { order_item_id: l.id, execution_flow: flow };
        if (flow === 'inventory') {
          const rows = invPick[l.id] || [];
          base.inventory = rows
            .filter((r) => r.wiId && Number(r.qty) > 0)
            .map((r) => ({ warehouse_inventory_id: r.wiId, quantity: Number(r.qty) }));
        }
        return base;
      });
      await assignOrderItemFlows(selectedOrderId, assignments);
      toast.success('Execution flows saved');
      await loadQueue();
      await loadLines(selectedOrderId);
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
            <AlertTitle>Queue view unavailable</AlertTitle>
            <AlertDescription className="text-sm">{queueLoadNotice}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Require flow assignment (custom orders)</CardTitle>
            {flagLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <div className="flex items-center gap-2">
                <Switch
                  checked={requireFlag}
                  onCheckedChange={(v) => void saveFlag(v)}
                  id="req-flow"
                  disabled={!!settingsSchemaError}
                />
                <Label htmlFor="req-flow" className="text-sm font-normal cursor-pointer">
                  When enabled, first receipt sets lines to pending assignment
                </Label>
              </div>
            )}
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orders awaiting assignment</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingQueue ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : queue.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                {requireFlag
                  ? 'No orders are waiting for flow assignment (or no receipts yet).'
                  : 'Turn on “Require flow assignment” above to gate orders after receipt.'}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Pending lines</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.map((r) => (
                    <TableRow key={r.order_id}>
                      <TableCell className="font-medium">{r.order_number}</TableCell>
                      <TableCell>{r.customer_name || '—'}</TableCell>
                      <TableCell>{r.order_type || '—'}</TableCell>
                      <TableCell>
                        {r.pending_line_count ?? 0} / {r.line_count ?? 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setSelectedOrderId(r.order_id)}>
                          Assign flows
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {selectedOrderId && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Lines for order</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => navigate(`/orders/${selectedOrderId}`)}>
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Order detail
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedOrderId(null)}>
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingLines ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  {pendingLines.length === 0 && (
                    <p className="text-sm text-muted-foreground">All lines on this order already have a flow assigned.</p>
                  )}
                  {orderLines.map((line) => (
                    <div key={line.id} className="rounded-lg border border-border p-4 space-y-3">
                      <div className="flex flex-wrap justify-between gap-2">
                        <div>
                          <p className="font-medium">{line.product_description || 'Line item'}</p>
                          <p className="text-xs text-muted-foreground">
                            Qty {line.quantity ?? '—'} · {fulfillmentStatusLabel(line.fulfillment_status as any)}
                          </p>
                        </div>
                      </div>
                      <RadioGroup
                        value={choices[line.id] || 'stitching'}
                        onValueChange={(v) => {
                          const flow = v as ExecutionFlow;
                          setChoices((c) => ({ ...c, [line.id]: flow }));
                          if (flow === 'inventory') {
                            setInvPick((p) => ({
                              ...p,
                              [line.id]: p[line.id]?.length ? p[line.id]! : [{ wiId: '', qty: String(line.quantity ?? '') }],
                            }));
                            void loadWiForLine(line);
                          }
                        }}
                        className="flex flex-wrap gap-4"
                      >
                        {EXECUTION_FLOWS.map((f) => (
                          <div key={f} className="flex items-center space-x-2">
                            <RadioGroupItem value={f} id={`${line.id}-${f}`} />
                            <Label htmlFor={`${line.id}-${f}`} className="font-normal cursor-pointer">
                              {executionFlowLabel(f)}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                      {choices[line.id] === 'inventory' && (
                        <div className="space-y-2 pl-1 border-l-2 border-muted ml-1">
                          <p className="text-sm text-muted-foreground">Reserve stock (warehouse rows for this product)</p>
                          {(invPick[line.id] || [{ wiId: '', qty: '' }]).map((row, idx) => (
                            <div key={idx} className="flex flex-wrap gap-2 items-end">
                              <div className="space-y-1">
                                <Label className="text-xs">Bin stock</Label>
                                <select
                                  className="flex h-9 w-56 rounded-md border border-input bg-background px-2 text-sm"
                                  value={row.wiId}
                                  onChange={(e) => {
                                    const next = [...(invPick[line.id] || [{ wiId: '', qty: '' }])];
                                    next[idx] = { ...next[idx], wiId: e.target.value };
                                    setInvPick((p) => ({ ...p, [line.id]: next }));
                                  }}
                                >
                                  <option value="">Select row…</option>
                                  {(wiOptions[line.id] || []).map((w) => (
                                    <option key={w.id} value={w.id}>
                                      {w.item_name || w.id} — {w.quantity} pcs
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Qty</Label>
                                <Input
                                  className="h-9 w-24"
                                  value={row.qty}
                                  onChange={(e) => {
                                    const next = [...(invPick[line.id] || [{ wiId: '', qty: '' }])];
                                    next[idx] = { ...next[idx], qty: e.target.value };
                                    setInvPick((p) => ({ ...p, [line.id]: next }));
                                  }}
                                />
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mb-0.5"
                                onClick={() => {
                                  const next = [...(invPick[line.id] || [{ wiId: '', qty: '' }]), { wiId: '', qty: '' }];
                                  setInvPick((p) => ({ ...p, [line.id]: next }));
                                }}
                              >
                                Add row
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      {choices[line.id] === 'outsource' && (
                        <div className="text-sm">
                          <Button
                            type="button"
                            variant="link"
                            className="h-auto p-0"
                            onClick={() =>
                              navigate(
                                `/procurement/po/new?sales_order_id=${selectedOrderId}&sales_order_item_id=${line.id}`
                              )
                            }
                          >
                            Open purchase order for this line
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  <Button onClick={() => void submitAssignments()} disabled={saving || orderLines.length === 0}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save assignments'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ErpLayout>
  );
};

export default OrderFlowAssignmentPage;
