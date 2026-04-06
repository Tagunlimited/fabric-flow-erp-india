import { supabase } from '@/integrations/supabase/client';
import {
  buildBatchAssignmentDocumentData,
  type BatchAssignmentDocumentData,
} from '@/utils/batchAssignmentDocument';

/** Minimal job shape needed to build the stitching job card (matches CuttingManager batch assignment rows). */
export interface StitchingJobCardJob {
  id: string;
  orderNumber: string;
  customerName: string;
  batchAssignments?: Array<{
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

    const snRate =
      priceData && !priceError && !('error' in (priceData as any))
        ? (priceData as any).cutting_price_single_needle || 0
        : 0;
    const ofRate =
      priceData && !priceError && !('error' in (priceData as any))
        ? (priceData as any).cutting_price_overlock_flatlock || 0
        : 0;

    const rawBatches = (job.batchAssignments || []).map((assignment) => {
      let sizeDistributions: Array<{ size: string; quantity: number }> = [];

      if (Array.isArray(assignment.size_distributions)) {
        sizeDistributions = assignment.size_distributions.map((sd: any) => ({
          size: sd.size_name || sd.size || '',
          quantity: typeof sd.quantity === 'number' ? sd.quantity : 0,
        }));
      } else if (assignment.size_distributions && typeof assignment.size_distributions === 'object') {
        sizeDistributions = Object.entries(assignment.size_distributions)
          .filter(([_, qty]) => typeof qty === 'number' && qty > 0)
          .map(([size, qty]) => ({ size, quantity: qty as number }));
      }

      const assignedQuantity = sizeDistributions.reduce((sum, sd) => sum + sd.quantity, 0);

      return {
        batchName: assignment.batch_name || 'Unknown Batch',
        batchLeaderName: assignment.batch_leader_name || 'Unknown Leader',
        batchLeaderAvatarUrl: assignment.batch_leader_avatar_url || undefined,
        tailorType: assignment.tailor_type || 'single_needle',
        sizeDistributions,
        snRate,
        ofRate,
        assignedQuantity,
      };
    });

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
