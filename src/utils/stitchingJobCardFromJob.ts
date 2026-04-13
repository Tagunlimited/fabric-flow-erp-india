import { supabase } from '@/integrations/supabase/client';
import {
  buildBatchAssignmentDocumentData,
  type BatchAssignmentDocumentData,
  type RawBatchAssignmentInput,
} from '@/utils/batchAssignmentDocument';
import { buildLineRatesMapFromOrderItems } from '@/utils/orderItemCuttingRates';

/** Minimal job shape needed to build the stitching job card (matches CuttingManager batch assignment rows). */
export interface StitchingJobCardJob {
  id: string;
  orderNumber: string;
  customerName: string;
  batchAssignments?: Array<{
    id?: string;
    batch_id?: string;
    notes?: string;
    batch_name?: string;
    batch_leader_name?: string;
    batch_leader_avatar_url?: string;
    tailor_type?: string;
    total_quantity?: number;
    size_distributions?: Array<{
      size_name?: string;
      size?: string;
      quantity?: number;
    }> | Record<string, number>;
  }>;
}

function parseOrderItemIdFromNotes(notes: unknown): string | null {
  if (notes == null) return null;
  const m = String(notes).match(/\[line:([0-9a-f-]{36})\]/i);
  return m ? m[1] : null;
}

function normalizeAssignmentSizeDistributions(assignment: {
  size_distributions?: Array<{ size_name?: string; size?: string; quantity?: unknown }> | Record<string, number>;
}): { size: string; quantity: number }[] {
  let sizeDistributions: Array<{ size: string; quantity: number }> = [];
  const raw = assignment.size_distributions;
  if (Array.isArray(raw)) {
    sizeDistributions = raw.map((sd) => ({
      size: sd.size_name || sd.size || '',
      quantity: typeof sd.quantity === 'number' ? sd.quantity : Number(sd.quantity) || 0,
    }));
  } else if (raw && typeof raw === 'object') {
    sizeDistributions = Object.entries(raw)
      .filter(([_, qty]) => typeof qty === 'number' && qty > 0)
      .map(([size, qty]) => ({ size, quantity: qty as number }));
  }
  return sizeDistributions;
}

/**
 * One physical batch (same batch_id) may have multiple DB rows (one per order line). Merge into a single card page.
 */
function mergeSizeMapToSorted(map: Map<string, number>): { size: string; quantity: number }[] {
  return [...map.entries()]
    .map(([size, quantity]) => ({ size, quantity }))
    .filter((x) => x.quantity > 0)
    .sort((a, b) => a.size.localeCompare(b.size));
}

function mergeAssignmentsToRawBatches(
  assignments: NonNullable<StitchingJobCardJob['batchAssignments']>,
  snRate: number,
  ofRate: number,
  validOrderItemIds: Set<string>,
  lineRatesByOrderItemId?: Record<string, { sn: number; of: number }>
): RawBatchAssignmentInput[] {
  type Acc = {
    batchName: string;
    batchLeaderName: string;
    batchLeaderAvatarUrl?: string;
    tailorType: string;
    /** Per order line — sizes for that line only */
    lineSizeMaps: Map<string, Map<string, number>>;
    /** Assignments without [line:] — merged sizes */
    globalSizeMap: Map<string, number>;
    assignedQuantities: Record<string, number>;
    anyUntagged: boolean;
  };

  const groups = new Map<string, Acc>();

  for (const assignment of assignments) {
    const batchKey =
      assignment.batch_id != null && String(assignment.batch_id).trim() !== ''
        ? String(assignment.batch_id)
        : `__noid__${assignment.id ?? 'row'}`;

    const sizeDistributions = normalizeAssignmentSizeDistributions(assignment);
    const rowQty = sizeDistributions.reduce((sum, sd) => sum + sd.quantity, 0);
    const lineIdRaw = parseOrderItemIdFromNotes(assignment.notes);
    const lineId = lineIdRaw && validOrderItemIds.has(lineIdRaw) ? lineIdRaw : null;

    if (!groups.has(batchKey)) {
      groups.set(batchKey, {
        batchName: assignment.batch_name || 'Unknown Batch',
        batchLeaderName: assignment.batch_leader_name || 'Unknown Leader',
        batchLeaderAvatarUrl: assignment.batch_leader_avatar_url || undefined,
        tailorType: assignment.tailor_type || 'single_needle',
        lineSizeMaps: new Map(),
        globalSizeMap: new Map(),
        assignedQuantities: {},
        anyUntagged: false,
      });
    }
    const g = groups.get(batchKey)!;

    if (lineId) {
      if (!g.lineSizeMaps.has(lineId)) g.lineSizeMaps.set(lineId, new Map());
      const lm = g.lineSizeMaps.get(lineId)!;
      for (const sd of sizeDistributions) {
        if (!sd.size) continue;
        lm.set(sd.size, (lm.get(sd.size) || 0) + sd.quantity);
      }
      g.assignedQuantities[lineId] = (g.assignedQuantities[lineId] || 0) + rowQty;
    } else {
      g.anyUntagged = true;
      for (const sd of sizeDistributions) {
        if (!sd.size) continue;
        g.globalSizeMap.set(sd.size, (g.globalSizeMap.get(sd.size) || 0) + sd.quantity);
      }
    }
  }

  const result: RawBatchAssignmentInput[] = [];
  for (const g of groups.values()) {
    const productSizeBreakdown: Array<{ orderItemId: string; sizes: { size: string; quantity: number }[] }> = [];
    for (const [orderItemId, m] of g.lineSizeMaps.entries()) {
      const sizes = mergeSizeMapToSorted(m);
      if (sizes.length > 0) {
        productSizeBreakdown.push({ orderItemId, sizes });
      }
    }

    const combinedSizes = mergeSizeMapToSorted(g.globalSizeMap);
    const lineQtySum = productSizeBreakdown.reduce(
      (s, b) => s + b.sizes.reduce((t, x) => t + x.quantity, 0),
      0
    );
    const globalQtySum = combinedSizes.reduce((s, x) => s + x.quantity, 0);
    const assignedQuantity = lineQtySum + globalQtySum;

    const mergedMap = new Map<string, number>();
    for (const m of g.lineSizeMaps.values()) {
      for (const [sz, q] of m.entries()) {
        mergedMap.set(sz, (mergedMap.get(sz) || 0) + q);
      }
    }
    for (const [sz, q] of g.globalSizeMap.entries()) {
      mergedMap.set(sz, (mergedMap.get(sz) || 0) + q);
    }
    const sizeDistributions = mergeSizeMapToSorted(mergedMap);

    let orderItemIds: string[] | undefined;
    let assignedQuantities: Record<string, number> | undefined;

    if (!g.anyUntagged && Object.keys(g.assignedQuantities).length > 0) {
      const filtered = Object.fromEntries(
        Object.entries(g.assignedQuantities).filter(([id]) => validOrderItemIds.has(id))
      );
      if (Object.keys(filtered).length > 0) {
        orderItemIds = Object.keys(filtered);
        assignedQuantities = filtered;
      }
    }

    result.push({
      batchName: g.batchName,
      batchLeaderName: g.batchLeaderName,
      batchLeaderAvatarUrl: g.batchLeaderAvatarUrl,
      tailorType: g.tailorType,
      sizeDistributions,
      snRate,
      ofRate,
      assignedQuantity,
      orderItemIds,
      assignedQuantities,
      productSizeBreakdown: productSizeBreakdown.length > 0 ? productSizeBreakdown : undefined,
      combinedSizes: combinedSizes.length > 0 ? combinedSizes : undefined,
      ...(lineRatesByOrderItemId && Object.keys(lineRatesByOrderItemId).length > 0
        ? { lineRatesByOrderItemId }
        : {}),
    });
  }

  return result;
}

/**
 * Build A5 stitching job card document from a cutting job (all batch assignments + all order lines).
 * Shared by Cutting Manager PDF button and multi-line batch wizard completion.
 */
export async function buildStitchingJobCardDocumentForJob(
  job: StitchingJobCardJob
): Promise<BatchAssignmentDocumentData | null> {
  try {
    const { data: priceData, error: priceError } = await supabase
      .from('order_assignments' as any)
      .select('cutting_price_single_needle, cutting_price_overlock_flatlock')
      .eq('order_id', job.id as any)
      .single();

    if (priceError) {
      console.error('Error fetching pricing data:', priceError);
      return null;
    }

    const { data: orderData, error: orderError } = await supabase
      .from('orders' as any)
      .select('*')
      .eq('id', job.id as any)
      .single();

    if (orderError) {
      console.error('Error fetching order data:', orderError);
      return null;
    }

    const { data: orderItemsData, error: itemsError } = await supabase
      .from('order_items' as any)
      .select('*')
      .eq('order_id', job.id as any);

    if (itemsError) {
      console.error('Error fetching order items:', itemsError);
      return null;
    }

    const categoryIds = Array.from(
      new Set((orderItemsData || []).map((item: any) => item.product_category_id).filter(Boolean))
    );
    const fabricIds = Array.from(
      new Set((orderItemsData || []).map((item: any) => item.fabric_id).filter(Boolean))
    );

    const categoriesMap: Record<string, any> = {};
    if (categoryIds.length > 0) {
      const { data: categories } = await supabase
        .from('product_categories')
        .select('id, category_name, category_image_url')
        .in('id', categoryIds);
      (categories || []).forEach((cat: any) => {
        categoriesMap[cat.id] = cat;
      });
    }

    const fabricMap: Record<string, any> = {};
    if (fabricIds.length > 0) {
      const { data: fabrics } = await supabase
        .from('fabric_master')
        .select('id, fabric_name, color, gsm, image, hex')
        .in('id', fabricIds);
      (fabrics || []).forEach((fabric: any) => {
        fabricMap[fabric.id] = fabric;
      });
    }

    const enrichedOrderItems = (orderItemsData || []).map((item: any) => {
      let customizations: any[] = [];
      try {
        const specs =
          typeof item.specifications === 'string'
            ? JSON.parse(item.specifications || '{}')
            : item.specifications || {};
        customizations = specs.customizations || [];
      } catch {
        customizations = [];
      }

      return {
        ...item,
        product_categories: categoriesMap[item.product_category_id],
        fabric: fabricMap[item.fabric_id],
        customizations,
      };
    });

    let salesManager: { name: string; avatarUrl?: string } | undefined;
    if (orderData && !orderError && (orderData as any).sales_manager) {
      try {
        const { data: salesManagerData } = await supabase
          .from('employees' as any)
          .select('id, full_name, avatar_url')
          .eq('id', (orderData as any).sales_manager as any)
          .single();
        if (salesManagerData && !('error' in salesManagerData)) {
          salesManager = {
            name: (salesManagerData as any).full_name,
            avatarUrl: (salesManagerData as any).avatar_url || undefined,
          };
        }
      } catch (e) {
        console.error('Error fetching sales manager:', e);
      }
    }

    const { data: companySettings, error: settingsError } = await supabase
      .from('company_settings')
      .select('*')
      .single();

    if (settingsError || !companySettings || 'error' in (companySettings as any)) {
      console.error('Invalid company settings', settingsError);
      return null;
    }

    const orderDefaults =
      priceData && !priceError && !('error' in (priceData as any))
        ? {
            cutting_price_single_needle: (priceData as any).cutting_price_single_needle,
            cutting_price_overlock_flatlock: (priceData as any).cutting_price_overlock_flatlock,
          }
        : {};

    const snRate = Math.max(0, Number(orderDefaults.cutting_price_single_needle) || 0);
    const ofRate = Math.max(0, Number(orderDefaults.cutting_price_overlock_flatlock) || 0);

    const lineRatesByOrderItemId = buildLineRatesMapFromOrderItems(
      enrichedOrderItems as any[],
      orderDefaults
    );

    const validOrderItemIds = new Set((enrichedOrderItems || []).map((i: any) => String(i.id)));
    const rawBatches = mergeAssignmentsToRawBatches(
      job.batchAssignments || [],
      snRate,
      ofRate,
      validOrderItemIds,
      lineRatesByOrderItemId
    );

    const allCustomizations: any[] = [];
    enrichedOrderItems.forEach((item: any) => {
      if (item.customizations && Array.isArray(item.customizations)) {
        item.customizations.forEach((cust: any) => {
          allCustomizations.push(cust);
        });
      }
    });

    if (!orderData || orderError || 'error' in (orderData as any)) {
      return null;
    }

    const doc = buildBatchAssignmentDocumentData({
      orderNumber: job.orderNumber,
      customerName: job.customerName,
      orderItems: enrichedOrderItems,
      rawBatches,
      companySettings: companySettings as any,
      salesManager,
      customizations: allCustomizations,
      dueDate: (orderData as any).expected_delivery_date,
      orderDate: (orderData as any).order_date,
      orderNotes: (orderData as any).notes ? String((orderData as any).notes) : undefined,
    });

    if (doc.batchAssignments.length === 0) {
      return null;
    }
    return doc;
  } catch (error) {
    console.error('buildStitchingJobCardDocumentForJob:', error);
    return null;
  }
}
