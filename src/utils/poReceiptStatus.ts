import {
  effectiveReceivedQtyForGrnLine,
  isGrnLineApprovedQuality,
  isGrnWorkflowComplete,
} from '@/utils/grnStatus';

export type PoReceiptBucket = 'fully_received' | 'open_grn' | 'needs_grn' | 'cancelled';

type PoItemRow = { id: string; quantity?: number | null };
type GrnItemRow = {
  po_item_id: string;
  approved_quantity?: number | null;
  received_quantity?: number | null;
  quality_status?: string | null;
};
type GrnRow = {
  id: string;
  status?: string | null;
  grn_items?: GrnItemRow[] | null;
};
type PoForReceipt = {
  status?: string | null;
  items?: PoItemRow[] | null;
  grns?: GrnRow[] | null;
};

function receivedQtyByPoItem(po: PoForReceipt): Map<string, number> {
  const map = new Map<string, number>();
  for (const grn of po.grns || []) {
    const headerClosed = isGrnWorkflowComplete(grn.status, grn.grn_items || undefined);
    for (const gi of grn.grn_items || []) {
      const poItemId = gi.po_item_id;
      if (!poItemId) continue;
      let qty = effectiveReceivedQtyForGrnLine(gi);
      // Approved GRN header but line QC still pending (legacy rows): count physical receipt.
      if (qty <= 0 && headerClosed && String(grn.status || '').toLowerCase() === 'approved') {
        qty = Math.max(Number(gi.approved_quantity) || 0, Number(gi.received_quantity) || 0);
      }
      if (qty <= 0) continue;
      map.set(poItemId, (map.get(poItemId) || 0) + qty);
    }
  }
  return map;
}

/** True when every PO line has approved GRN qty >= ordered (over-receipt counts). */
export function isPurchaseOrderFullyReceived(po: PoForReceipt): boolean {
  const items = po.items || [];
  if (items.length === 0) return false;
  const received = receivedQtyByPoItem(po);
  return items.every((item) => (received.get(item.id) || 0) >= (Number(item.quantity) || 0));
}

export function classifyPurchaseOrderReceipt(po: PoForReceipt): PoReceiptBucket {
  if (po.status === 'cancelled') return 'cancelled';
  if (po.status === 'completed' || isPurchaseOrderFullyReceived(po)) return 'fully_received';

  const grns = po.grns || [];
  if (grns.length === 0) return 'needs_grn';

  const hasOpenGrn = grns.some(
    (g) => !isGrnWorkflowComplete(g.status, g.grn_items || undefined)
  );
  if (hasOpenGrn) return 'open_grn';

  // GRN(s) exist and are workflow-complete but PO lines are not fully covered yet.
  return 'open_grn';
}

export { isGrnLineApprovedQuality, effectiveReceivedQtyForGrnLine };
