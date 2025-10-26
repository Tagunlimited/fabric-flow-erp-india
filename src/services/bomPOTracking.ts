import { supabase } from '@/integrations/supabase/client';

export interface BomItemOrderStatus {
  bom_id: string;
  bom_number: string;
  bom_item_id: string;
  item_name: string;
  total_required: number;
  total_ordered: number;
  remaining_quantity: number;
  image_url?: string | null;
  // Fabric attributes
  fabric_name?: string;
  fabric_color?: string;
  fabric_gsm?: string;
  // Item attributes
  item_attributes?: {
    item_code?: string;
    description?: string;
    size?: string;
    color?: string;
    material?: string;
    weight?: number;
    brand?: string;
    current_stock?: number;
    min_stock_level?: number;
    lead_time?: number;
    cost_price?: number;
    gst_rate?: number;
    uom?: string;
    type?: string;
  };
  // Additional fields for PO creation
  item_id?: string | null;
  item_code?: string | null;
  category?: string;
  unit_of_measure?: string;
}

export interface BomPOItem {
  id: string;
  bom_id: string;
  bom_item_id: string;
  po_id: string;
  po_item_id: string;
  ordered_quantity: number;
  created_at: string;
}

export interface BomPurchaseOrder {
  po_id: string;
  po_number: string;
  supplier_name: string;
  created_at: string;
  total_amount: number;
  items: Array<{
    bom_item_id: string;
    item_name: string;
    ordered_quantity: number;
  }>;
}

/**
 * Get remaining quantities for all items in a BOM
 */
export async function getBomItemOrderStatus(bomId: string): Promise<BomItemOrderStatus[]> {
  try {
    const { data, error } = await supabase
      .from('bom_item_order_status')
      .select('*')
      .eq('bom_id', bomId)
      .order('item_name');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching BOM item order status:', error);
    throw error;
  }
}

/**
 * Check if a BOM item can be ordered (has remaining quantity)
 */
export async function canOrderBomItem(bomItemId: string, quantity: number): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('bom_item_order_status')
      .select('remaining_quantity')
      .eq('bom_item_id', bomItemId)
      .single();

    if (error) throw error;
    return data?.remaining_quantity >= quantity;
  } catch (error) {
    console.error('Error checking if BOM item can be ordered:', error);
    return false;
  }
}

/**
 * Create tracking records after PO creation
 */
export async function trackBomPOItems(
  poId: string,
  bomId: string,
  items: Array<{
    bomItemId: string;
    poItemId: string;
    quantity: number;
  }>
): Promise<void> {
  try {
    const trackingRecords = items.map(item => ({
      bom_id: bomId,
      bom_item_id: item.bomItemId,
      po_id: poId,
      po_item_id: item.poItemId,
      ordered_quantity: item.quantity
    }));

    const { error } = await supabase
      .from('bom_po_items')
      .insert(trackingRecords);

    if (error) throw error;
  } catch (error) {
    console.error('Error creating BOM-PO tracking records:', error);
    throw error;
  }
}

/**
 * Get all purchase orders created from a BOM
 */
export async function getBomPurchaseOrders(bomId: string): Promise<BomPurchaseOrder[]> {
  try {
    const { data, error } = await supabase
      .from('bom_po_items')
      .select(`
        po_id,
        purchase_orders!inner(
          id,
          po_number,
          supplier_name,
          created_at,
          total_amount
        )
      `)
      .eq('bom_id', bomId);

    if (error) throw error;

    // Group by PO and aggregate items
    const poMap = new Map<string, BomPurchaseOrder>();
    
    data?.forEach(record => {
      const po = record.purchase_orders;
      if (!poMap.has(record.po_id)) {
        poMap.set(record.po_id, {
          po_id: record.po_id,
          po_number: po.po_number,
          supplier_name: po.supplier_name,
          created_at: po.created_at,
          total_amount: po.total_amount,
          items: []
        });
      }
    });

    // Get items for each PO
    for (const [poId, po] of poMap) {
      const { data: itemsData, error: itemsError } = await supabase
        .from('bom_po_items')
        .select(`
          bom_item_id,
          ordered_quantity,
          bom_record_items!inner(item_name)
        `)
        .eq('po_id', poId);

      if (itemsError) throw itemsError;

      po.items = itemsData?.map(item => ({
        bom_item_id: item.bom_item_id,
        item_name: item.bom_record_items.item_name,
        ordered_quantity: item.ordered_quantity
      })) || [];
    }

    return Array.from(poMap.values());
  } catch (error) {
    console.error('Error fetching BOM purchase orders:', error);
    throw error;
  }
}

/**
 * Get BOM completion status
 */
export async function getBomCompletionStatus(bomId: string): Promise<{
  totalItems: number;
  orderedItems: number;
  completionPercentage: number;
  status: 'not_started' | 'in_progress' | 'completed';
}> {
  try {
    const statusData = await getBomItemOrderStatus(bomId);
    
    const totalItems = statusData.length;
    const orderedItems = statusData.filter(item => item.total_ordered > 0).length;
    const completionPercentage = totalItems > 0 ? Math.round((orderedItems / totalItems) * 100) : 0;
    
    let status: 'not_started' | 'in_progress' | 'completed';
    if (completionPercentage === 0) {
      status = 'not_started';
    } else if (completionPercentage === 100) {
      status = 'completed';
    } else {
      status = 'in_progress';
    }

    return {
      totalItems,
      orderedItems,
      completionPercentage,
      status
    };
  } catch (error) {
    console.error('Error getting BOM completion status:', error);
    throw error;
  }
}

/**
 * Validate quantity before ordering
 */
export async function validateOrderQuantities(
  bomId: string,
  items: Array<{ bomItemId: string; quantity: number }>
): Promise<{ valid: boolean; errors: string[] }> {
  try {
    const statusData = await getBomItemOrderStatus(bomId);
    const errors: string[] = [];

    for (const item of items) {
      const bomItem = statusData.find(s => s.bom_item_id === item.bomItemId);
      if (!bomItem) {
        errors.push(`Item not found in BOM`);
        continue;
      }

      if (item.quantity <= 0) {
        errors.push(`${bomItem.item_name}: Quantity must be greater than 0`);
        continue;
      }

      if (item.quantity > bomItem.remaining_quantity) {
        errors.push(
          `${bomItem.item_name}: Cannot order ${item.quantity} units. Only ${bomItem.remaining_quantity} units remaining`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  } catch (error) {
    console.error('Error validating order quantities:', error);
    return {
      valid: false,
      errors: ['Error validating quantities']
    };
  }
}
