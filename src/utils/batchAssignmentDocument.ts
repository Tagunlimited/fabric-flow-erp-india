/**
 * Shared batch assignment “stitching job card” model: SN vs OF earnings, product split, totals.
 */

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
}

export interface ProductEarningRow {
  label: string;
  category: string;
  orderQty: number;
  snEarning: number;
  ofEarning: number;
  lineTotal: number;
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
  summaryTotals: {
    totalSn: number;
    totalOf: number;
    grandTotal: number;
  };
  productEarningRows: ProductEarningRow[];
}

export function normalizeTailorType(tailorType: string | undefined): 'single_needle' | 'overlock_flatlock' {
  const s = String(tailorType || '').toLowerCase();
  if (s.includes('overlock') || s.includes('flatlock')) return 'overlock_flatlock';
  return 'single_needle';
}

/** Per-batch SN vs OF amounts from order rates and batch tailor type. */
export function computeBatchEarningParts(
  assignedQuantity: number,
  snRate: number,
  ofRate: number,
  tailorType: string | undefined
): { snEarning: number; ofEarning: number; totalEarning: number } {
  const q = Math.max(0, Number(assignedQuantity) || 0);
  const sn = Math.max(0, Number(snRate) || 0);
  const of = Math.max(0, Number(ofRate) || 0);
  const mode = normalizeTailorType(tailorType);
  const snEarning = mode === 'single_needle' ? Math.round(sn * q * 100) / 100 : 0;
  const ofEarning = mode === 'overlock_flatlock' ? Math.round(of * q * 100) / 100 : 0;
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

export interface RawBatchAssignmentInput {
  batchName: string;
  batchLeaderName: string;
  batchLeaderAvatarUrl?: string;
  tailorType: string;
  sizeDistributions: { size: string; quantity: number }[];
  snRate: number;
  ofRate: number;
  assignedQuantity: number;
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
}): BatchAssignmentDocumentData {
  const batchAssignments: BatchAssignmentDocumentBatch[] = params.rawBatches.map((b) => {
    const { snEarning, ofEarning, totalEarning } = computeBatchEarningParts(
      b.assignedQuantity,
      b.snRate,
      b.ofRate,
      b.tailorType
    );
    return {
      batchName: b.batchName,
      batchLeaderName: b.batchLeaderName,
      batchLeaderAvatarUrl: b.batchLeaderAvatarUrl,
      tailorType: b.tailorType,
      sizeDistributions: b.sizeDistributions,
      snRate: b.snRate,
      ofRate: b.ofRate,
      assignedQuantity: b.assignedQuantity,
      snEarning,
      ofEarning,
      totalEarning,
    };
  });

  const totalSn = Math.round(batchAssignments.reduce((s, b) => s + b.snEarning, 0) * 100) / 100;
  const totalOf = Math.round(batchAssignments.reduce((s, b) => s + b.ofEarning, 0) * 100) / 100;
  const grandTotal = Math.round((totalSn + totalOf) * 100) / 100;

  const productEarningRows = buildProductEarningRows(params.orderItems, totalSn, totalOf);

  return {
    orderNumber: params.orderNumber,
    customerName: params.customerName,
    orderItems: params.orderItems,
    batchAssignments,
    companySettings: params.companySettings,
    salesManager: params.salesManager,
    customizations: params.customizations,
    dueDate: params.dueDate,
    summaryTotals: { totalSn, totalOf, grandTotal },
    productEarningRows,
  };
}
