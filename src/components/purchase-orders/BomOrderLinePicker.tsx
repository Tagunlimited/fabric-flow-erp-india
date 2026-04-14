import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Package, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { BomForm } from './BomForm';
import {
  sortOrderLines,
  BOM_ORDER_ITEMS_SELECT,
  orderLineFabricColorGsmSuffix,
  orderLineBomProductColumnLabel,
  orderLineProductDropdownOnly,
} from './bomOrderLineUtils';
import './BomLinePicker.css';

export { sortOrderLines, lineProductIndex, bomNumberForOrderLine } from './bomOrderLineUtils';

type OrderLine = {
  id: string;
  quantity: number;
  product_description?: string | null;
  category_image_url?: string | null;
  created_at?: string | null;
};

interface BomOrderLinePickerProps {
  orderId: string;
  onBack: () => void;
}

export function BomOrderLinePicker({ orderId, onBack }: BomOrderLinePickerProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [orderNumber, setOrderNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bomIdByItemId, setBomIdByItemId] = useState<Record<string, string>>({});
  const [hasLegacyFullOrderBom, setHasLegacyFullOrderBom] = useState(false);

  const sortedLines = useMemo(() => sortOrderLines(lines), [lines]);

  const refreshBomCoverage = useCallback(async () => {
    try {
      const { data: boms, error: bErr } = await supabase
        .from('bom_records')
        .select('id, order_item_id')
        .eq('order_id', orderId as any);

      if (bErr) throw bErr;
      const map: Record<string, string> = {};
      let legacy = false;
      (boms || []).forEach((b: any) => {
        if (b.order_item_id == null) legacy = true;
        else if (b.id) map[b.order_item_id] = b.id;
      });
      setBomIdByItemId(map);
      setHasLegacyFullOrderBom(legacy);
    } catch (e) {
      console.error(e);
    }
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data: order, error: oErr } = await supabase
          .from('orders')
          .select(
            `
            id,
            order_number,
            status,
            customer:customers(company_name),
            order_items(${BOM_ORDER_ITEMS_SELECT})
          `
          )
          .eq('is_deleted', false)
          .eq('id', orderId as any)
          .single();

        if (oErr) throw oErr;
        if (cancelled || !order) return;

        setOrderNumber((order as any).order_number || '');
        setCustomerName((order as any).customer?.company_name || '');
        const raw = (((order as any).order_items || []) as OrderLine[]).filter(
          (it: any) => it?.is_deleted !== true
        );
        setLines(raw);

        const sorted = sortOrderLines(raw);
        setSelectedId(sorted[0]?.id ?? null);

        const { data: boms, error: bErr } = await supabase
          .from('bom_records')
          .select('id, order_item_id')
          .eq('is_deleted', false)
          .eq('order_id', orderId as any);

        if (bErr) throw bErr;
        const map: Record<string, string> = {};
        let legacy = false;
        (boms || []).forEach((b: any) => {
          if (b.order_item_id == null) legacy = true;
          else if (b.id) map[b.order_item_id] = b.id;
        });
        if (!cancelled) {
          setBomIdByItemId(map);
          setHasLegacyFullOrderBom(legacy);
        }
      } catch (e) {
        console.error(e);
        toast.error('Failed to load order lines');
        onBack();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, onBack]);

  const selected = sortedLines.find(l => l.id === selectedId);
  const selectedHasBom =
    hasLegacyFullOrderBom || (selectedId ? !!bomIdByItemId[selectedId] : false);

  /** Block "Save BOM & Create PO" until every other line on this order has a BOM (no legacy shortcut). */
  const siblingsMissingBom =
    !hasLegacyFullOrderBom &&
    sortedLines.some((l) => l.id !== selectedId && !bomIdByItemId[l.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (sortedLines.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No products on this order.
          <Button variant="outline" className="mt-4 block mx-auto" onClick={onBack}>
            Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to orders
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">Create BOM — {orderNumber}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{customerName || 'Customer'}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <p className="text-sm font-medium text-foreground mb-3">Select product line</p>
            <div className="bom-line-radio-inputs" role="radiogroup" aria-label="Product lines">
              {sortedLines.map(item => {
                const label =
                  orderLineBomProductColumnLabel(item) || orderLineProductDropdownOnly(item) || '—';
                const fabricSuffix = orderLineFabricColorGsmSuffix(item);
                const hasLineBom = hasLegacyFullOrderBom || !!bomIdByItemId[item.id];
                return (
                  <label key={item.id} className="cursor-pointer">
                    <input
                      type="radio"
                      name="bom-order-line"
                      className="bom-line-radio-input"
                      checked={selectedId === item.id}
                      onChange={() => setSelectedId(item.id)}
                    />
                    <span className="bom-line-radio-tile">
                      <span className="bom-line-radio-label">
                        {label}
                        <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                          {item.quantity} pcs
                          {fabricSuffix ? ` · ${fabricSuffix}` : ''}
                          {hasLineBom ? ' · BOM exists' : ''}
                        </span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {selected && selectedHasBom && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3 border-t pt-6">
              {bomIdByItemId[selected.id] ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">This line already has a BOM</span>
                    <Badge variant="secondary">BOM created</Badge>
                  </div>
                  <Button
                    variant="default"
                    onClick={() => navigate(`/bom/${bomIdByItemId[selected.id]}?edit=1`)}
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit BOM
                  </Button>
                </>
              ) : hasLegacyFullOrderBom ? (
                <p className="text-sm text-muted-foreground">
                  A legacy order-level BOM covers this order. Open the <strong>View BOMs</strong> tab to find and
                  edit it.
                </p>
              ) : null}
            </div>
          )}

          {selected && !selectedHasBom && (
            <div className="border-t pt-6 space-y-4">
              <BomForm
                key={selected.id}
                embedded
                embeddedOrderId={orderId}
                embeddedOrderItemId={selected.id}
                onEmbeddedBomSaved={refreshBomCoverage}
                blockCreatePoUntilSiblingsReady={siblingsMissingBom}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
