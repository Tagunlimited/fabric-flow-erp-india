/**
 * Shared batch assignment “stitching job card” model: SN + OF earnings per batch qty, product split, totals.
 */

import { buildLineRatesMapFromOrderItems } from '@/utils/orderItemCuttingRates';

export interface BatchAssignmentDocumentCompany {
  company_name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  logo_url?: string;
  gstin: string;
  contact_phone: string;
  contact_email: string;
}

export interface BatchAssignmentDocumentBatch {
  batchName: string;
  batchLeaderName: string;
  batchLeaderAvatarUrl?: string;
  tailorType: string;
  sizeDistributions: { size: string; quantity: number }[];
  snRate: number;
  ofRate: number;
  assignedQuantity: number;
  snEarning: number;
  ofEarning: number;
  totalEarning: number;
  /** Earnings split for order lines on this batch page only */
  productEarningRows: ProductEarningRow[];
  /** order_items.id included on this page */
  batchOrderItemIds: string[];
  /** Sizes not linked to a specific order line (legacy / untagged assignments) */
  combinedSizeBreakdown?: { size: string; quantity: number }[];
}

export interface ProductEarningRow {
  label: string;
  category: string;
  orderQty: number;
  snEarning: number;
  ofEarning: number;
  lineTotal: number;
  orderItemId?: string;
  /** Sizes assigned to this batch for this order line */
  sizeBreakdown?: { size: string; quantity: number }[];
  lineRemarks?: string;
  lineCustomizations?: string;
}

export function formatOrderItemCustomizationsText(customizations: unknown): string {
  if (!customizations || !Array.isArray(customizations) || customizations.length === 0) return '';
  const parts = (customizations as any[]).map((c) => {
    const part = String(c?.partName || 'Part').trim();
    const val = String(c?.selectedAddonName || c?.customValue || '').trim();
    if (!val && !part) return '';
    return val ? `${part}: ${val}` : part;
  }).filter(Boolean);
  return parts.join(' · ');
}

export interface BatchAssignmentDocumentData {
  orderNumber: string;
  customerName: string;
  orderItems: any[];
  batchAssignments: BatchAssignmentDocumentBatch[];
  companySettings: BatchAssignmentDocumentCompany;
  salesManager?: { name: string; avatarUrl?: string };
  customizations: Array<{
    partId?: string;
    partName?: string;
    selectedAddonId?: string;
    selectedAddonName?: string;
    selectedAddonImageUrl?: string;
    selectedAddonImageAltText?: string;
    customValue?: string;
    quantity?: number;
    priceImpact?: number;
    colors?: Array<{ colorName?: string; hex?: string }>;
  }>;
  dueDate?: string;
  /** Order placed date (ISO) for display */
  orderDate?: string;
  summaryTotals: {
    totalSn: number;
    totalOf: number;
    grandTotal: number;
  };
  /** @deprecated Prefer each batch's productEarningRows; kept empty for compatibility */
  productEarningRows: ProductEarningRow[];
  /** Production / internal notes on the order */
  orderNotes?: string;
}

export function normalizeTailorType(tailorType: string | undefined): 'single_needle' | 'overlock_flatlock' {
  const s = String(tailorType || '').toLowerCase();
  if (s.includes('overlock') || s.includes('flatlock')) return 'overlock_flatlock';
  return 'single_needle';
}

/**
 * Per-batch SN and OF amounts: both rates apply to the quantity assigned to this batch
 * (batch may include multiple tailor roles; pay is not gated on a single tailor type).
 */
export function computeBatchEarningParts(
  assignedQuantity: number,
  snRate: number,
  ofRate: number
): { snEarning: number; ofEarning: number; totalEarning: number } {
  const q = Math.max(0, Number(assignedQuantity) || 0);
  const sn = Math.max(0, Number(snRate) || 0);
  const of = Math.max(0, Number(ofRate) || 0);
  const snEarning = Math.round(sn * q * 100) / 100;
  const ofEarning = Math.round(of * q * 100) / 100;
  const totalEarning = Math.round((snEarning + ofEarning) * 100) / 100;
  return { snEarning, ofEarning, totalEarning };
}

/** Split order-level SN/OF totals across products by line quantity weights. */
export function buildProductEarningRows(orderItems: any[], totalSn: number, totalOf: number): ProductEarningRow[] {
  if (!orderItems?.length) return [];
  const weights = orderItems.map((i) => Math.max(0, Number(i.quantity) || 0));
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  const rows = orderItems.map((item, idx) => {
    const w = weights[idx] / sumW;
    const snEarning = Math.round(totalSn * w * 100) / 100;
    const ofEarning = Math.round(totalOf * w * 100) / 100;
    return {
      label: String(item.product_description || '').trim() || 'Product',
      category: String(item.product_categories?.category_name || item.product_category?.category_name || '').trim() || '—',
      orderQty: weights[idx],
      snEarning,
      ofEarning,
      lineTotal: Math.round((snEarning + ofEarning) * 100) / 100,
    };
  });
  // Fix rounding drift on last row
  const snSum = rows.reduce((s, r) => s + r.snEarning, 0);
  const ofSum = rows.reduce((s, r) => s + r.ofEarning, 0);
  const driftsn = Math.round((totalSn - snSum) * 100) / 100;
  const driftof = Math.round((totalOf - ofSum) * 100) / 100;
  if (rows.length > 0 && (Math.abs(driftsn) > 0.001 || Math.abs(driftof) > 0.001)) {
    const last = rows[rows.length - 1];
    last.snEarning = Math.round((last.snEarning + driftsn) * 100) / 100;
    last.ofEarning = Math.round((last.ofEarning + driftof) * 100) / 100;
    last.lineTotal = Math.round((last.snEarning + last.ofEarning) * 100) / 100;
  }
  return rows;
}

/** Split batch SN/OF totals across lines using arbitrary non-negative weights (e.g. pcs assigned to this batch per product). */
export function buildProductEarningRowsWeighted(
  orderItems: any[],
  weights: number[],
  totalSn: number,
  totalOf: number
): ProductEarningRow[] {
  if (!orderItems?.length) return [];
  const w = weights.map((x) => Math.max(0, Number(x) || 0));
  const sumW = w.reduce((a, b) => a + b, 0) || 1;
  const rows = orderItems.map((item, idx) => {
    const ratio = w[idx] / sumW;
    const snEarning = Math.round(totalSn * ratio * 100) / 100;
    const ofEarning = Math.round(totalOf * ratio * 100) / 100;
    return {
      label: String(item.product_description || '').trim() || 'Product',
      category: String(item.product_categories?.category_name || item.product_category?.category_name || '').trim() || '—',
      orderQty: w[idx],
      snEarning,
      ofEarning,
      lineTotal: Math.round((snEarning + ofEarning) * 100) / 100,
    };
  });
  const snSum = rows.reduce((s, r) => s + r.snEarning, 0);
  const ofSum = rows.reduce((s, r) => s + r.ofEarning, 0);
  const driftsn = Math.round((totalSn - snSum) * 100) / 100;
  const driftof = Math.round((totalOf - ofSum) * 100) / 100;
  if (rows.length > 0 && (Math.abs(driftsn) > 0.001 || Math.abs(driftof) > 0.001)) {
    const last = rows[rows.length - 1];
    last.snEarning = Math.round((last.snEarning + driftsn) * 100) / 100;
    last.ofEarning = Math.round((last.ofEarning + driftof) * 100) / 100;
    last.lineTotal = Math.round((last.snEarning + last.ofEarning) * 100) / 100;
  }
  return rows;
}

export interface RawBatchAssignmentInput {
  batchName: string;
  batchLeaderName: string;
  batchLeaderAvatarUrl?: string;
  tailorType: string;
  sizeDistributions: { size: string; quantity: number }[];
  snRate: number;
  ofRate: number;
  assignedQuantity: number;
  /** When set, only these order lines appear on this batch card; weights from assignedQuantities */
  orderItemIds?: string[];
  /** Pcs assigned to this batch per order_item.id */
  assignedQuantities?: Record<string, number>;
  /** Per order line — sizes assigned to this batch for that line */
  productSizeBreakdown?: Array<{ orderItemId: string; sizes: { size: string; quantity: number }[] }>;
  /** Sizes from assignments without [line:] tag (shown once per batch card) */
  combinedSizes?: { size: string; quantity: number }[];
  /**
   * Per order_item.id SN/OF rates (e.g. from order_items columns with order_assignments fallback).
   * When set, batch and product earnings use qty × line rate instead of splitting one batch rate by weight.
   */
  lineRatesByOrderItemId?: Record<string, { sn: number; of: number }>;
}

function sortSizeEntries(sizes: { size: string; quantity: number }[]): { size: string; quantity: number }[] {
  return [...sizes].filter((s) => s.quantity > 0).sort((a, b) => a.size.localeCompare(b.size));
}

/** Build full document data from raw batch rows (rates + qty already known). */
export function buildBatchAssignmentDocumentData(params: {
  orderNumber: string;
  customerName: string;
  orderItems: any[];
  rawBatches: RawBatchAssignmentInput[];
  companySettings: BatchAssignmentDocumentCompany;
  salesManager?: { name: string; avatarUrl?: string };
  customizations: BatchAssignmentDocumentData['customizations'];
  dueDate?: string;
  orderDate?: string;
  orderNotes?: string;
}): BatchAssignmentDocumentData {
  const batchAssignments: BatchAssignmentDocumentBatch[] = params.rawBatches.map((b) => {
    let itemsInBatch = params.orderItems;
    if (b.orderItemIds && b.orderItemIds.length > 0) {
      const set = new Set(b.orderItemIds);
      const filtered = params.orderItems.filter((it: any) => set.has(it.id));
      if (filtered.length > 0) itemsInBatch = filtered;
    }

    const weights = itemsInBatch.map((it: any) => {
      if (b.assignedQuantities && b.assignedQuantities[it.id] != null) {
        return Math.max(0, Number(b.assignedQuantities[it.id]) || 0);
      }
      return Math.max(0, Number(it.quantity) || 0);
    });

    let w = weights;
    if (itemsInBatch.length > 0 && w.every((x) => x === 0)) {
      if (itemsInBatch.length === 1) {
        w = [Math.max(0, b.assignedQuantity)];
      } else {
        const sumQ = itemsInBatch.reduce((s, it: any) => s + Math.max(0, Number(it.quantity) || 0), 0) || 1;
        w = itemsInBatch.map((it: any) =>
          Math.round(((Number(it.quantity) || 0) / sumQ) * b.assignedQuantity * 100) / 100
        );
      }
    }

    /** Resolve SN/OF per order line from order_items + batch header rates (order_assignments defaults). */
    const derivedLineRates = buildLineRatesMapFromOrderItems(params.orderItems || [], {
      cutting_price_single_needle: b.snRate,
      cutting_price_overlock_flatlock: b.ofRate,
    });
    const callerOverride = b.lineRatesByOrderItemId;
    const hasCallerOverride =
      callerOverride && typeof callerOverride === 'object' && Object.keys(callerOverride).length > 0;
    const lineRates: Record<string, { sn: number; of: number }> = hasCallerOverride
      ? { ...derivedLineRates, ...callerOverride }
      : derivedLineRates;

    const usePerLineRates = Object.keys(lineRates).length > 0 && itemsInBatch.length > 0;

    let snEarning: number;
    let ofEarning: number;
    let totalEarning: number;
    let displaySnRate = b.snRate;
    let displayOfRate = b.ofRate;

    if (usePerLineRates) {
      let sumSn = 0;
      let sumOf = 0;
      const qtySum = w.reduce((a, x) => a + x, 0) || 0;
      for (let idx = 0; idx < itemsInBatch.length; idx++) {
        const it = itemsInBatch[idx] as any;
        const id = String(it.id);
        const lineQty = w[idx] ?? 0;
        const r = lineRates[id] || { sn: b.snRate, of: b.ofRate };
        sumSn += lineQty * r.sn;
        sumOf += lineQty * r.of;
      }
      snEarning = Math.round(sumSn * 100) / 100;
      ofEarning = Math.round(sumOf * 100) / 100;
      totalEarning = Math.round((snEarning + ofEarning) * 100) / 100;
      if (qtySum > 0) {
        displaySnRate = Math.round((snEarning / qtySum) * 10000) / 10000;
        displayOfRate = Math.round((ofEarning / qtySum) * 10000) / 10000;
      }
    } else {
      const parts = computeBatchEarningParts(b.assignedQuantity, b.snRate, b.ofRate);
      snEarning = parts.snEarning;
      ofEarning = parts.ofEarning;
      totalEarning = parts.totalEarning;
    }

    const breakdownByItemId = new Map(
      (b.productSizeBreakdown || []).map((x) => [x.orderItemId, sortSizeEntries(x.sizes)])
    );

    let productEarningRows: ProductEarningRow[];
    if (usePerLineRates) {
      productEarningRows = itemsInBatch.map((it: any, idx: number) => {
        const id = String(it.id);
        const lineQty = w[idx] ?? 0;
        const r = lineRates[id] || { sn: b.snRate, of: b.ofRate };
        const rowSn = Math.round(lineQty * r.sn * 100) / 100;
        const rowOf = Math.round(lineQty * r.of * 100) / 100;
        let sizes = breakdownByItemId.get(id) || [];
        if (sizes.length === 0 && itemsInBatch.length === 1 && b.sizeDistributions?.length) {
          sizes = sortSizeEntries(b.sizeDistributions);
        }
        const cust = formatOrderItemCustomizationsText(it.customizations);
        let rem = String(it.remarks || '').trim();
        if (!rem && it.specifications) {
          try {
            const specs =
              typeof it.specifications === 'string'
                ? JSON.parse(it.specifications || '{}')
                : it.specifications || {};
            rem = String(specs?.remarks || '').trim();
          } catch {
            /* ignore */
          }
        }
        return {
          label: String(it.product_description || '').trim() || 'Product',
          category:
            String(it.product_categories?.category_name || it.product_category?.category_name || '').trim() || '—',
          orderQty: lineQty,
          snEarning: rowSn,
          ofEarning: rowOf,
          lineTotal: Math.round((rowSn + rowOf) * 100) / 100,
          orderItemId: id,
          sizeBreakdown: sizes.length ? sizes : undefined,
          lineRemarks: rem || undefined,
          lineCustomizations: cust || undefined,
        };
      });
    } else {
      productEarningRows = buildProductEarningRowsWeighted(itemsInBatch, w, snEarning, ofEarning);
      productEarningRows = productEarningRows.map((row, idx) => {
        const it = itemsInBatch[idx];
        const id = String(it.id);
        let sizes = breakdownByItemId.get(id) || [];
        if (sizes.length === 0 && itemsInBatch.length === 1 && b.sizeDistributions?.length) {
          sizes = sortSizeEntries(b.sizeDistributions);
        }
        const cust = formatOrderItemCustomizationsText(it.customizations);
        let rem = String(it.remarks || '').trim();
        if (!rem && it.specifications) {
          try {
            const specs =
              typeof it.specifications === 'string'
                ? JSON.parse(it.specifications || '{}')
                : it.specifications || {};
            rem = String(specs?.remarks || '').trim();
          } catch {
            /* ignore */
          }
        }
        return {
          ...row,
          orderItemId: id,
          sizeBreakdown: sizes.length ? sizes : undefined,
          lineRemarks: rem || undefined,
          lineCustomizations: cust || undefined,
        };
      });
    }

    const batchOrderItemIds = itemsInBatch.map((it: any) => String(it.id));
    const combinedSizeBreakdown =
      b.combinedSizes && b.combinedSizes.length > 0 ? sortSizeEntries(b.combinedSizes) : undefined;

    return {
      batchName: b.batchName,
      batchLeaderName: b.batchLeaderName,
      batchLeaderAvatarUrl: b.batchLeaderAvatarUrl,
      tailorType: b.tailorType,
      sizeDistributions: b.sizeDistributions,
      snRate: displaySnRate,
      ofRate: displayOfRate,
      assignedQuantity: b.assignedQuantity,
      snEarning,
      ofEarning,
      totalEarning,
      productEarningRows,
      batchOrderItemIds,
      combinedSizeBreakdown,
    };
  });

  const totalSn = Math.round(batchAssignments.reduce((s, b) => s + b.snEarning, 0) * 100) / 100;
  const totalOf = Math.round(batchAssignments.reduce((s, b) => s + b.ofEarning, 0) * 100) / 100;
  const grandTotal = Math.round((totalSn + totalOf) * 100) / 100;

  return {
    orderNumber: params.orderNumber,
    customerName: params.customerName,
    orderItems: params.orderItems,
    batchAssignments,
    companySettings: params.companySettings,
    salesManager: params.salesManager,
    customizations: params.customizations,
    dueDate: params.dueDate,
    orderDate: params.orderDate,
    orderNotes: params.orderNotes?.trim() || undefined,
    summaryTotals: { totalSn, totalOf, grandTotal },
    productEarningRows: [],
  };
}
