import { supabase } from '@/integrations/supabase/client';

export interface AdjustmentReason {
  id: string;
  reason_name: string;
  description?: string;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface BinInfo {
  bin_id: string;
  bin_code: string;
  warehouse_name?: string;
  floor_number?: number;
  rack_code?: string;
  location_type?: string;
  current_quantity: number;
}

export interface BinAdjustment {
  bin_id: string;
  bin_code: string;
  quantity_before: number;
  adjustment_quantity: number; // Calculated automatically on save
  quantity_after: number; // Calculated automatically on save
}

export interface AdjustmentItem {
  id?: string;
  product_id: string;
  sku: string;
  product_name: string;
  product_class?: string;
  product_color?: string;
  product_size?: string;
  product_category?: string;
  product_brand?: string;
  quantity_before: number;
  adjustment_quantity: number;
  quantity_after: number;
  replace_quantity?: number;
  unit?: string;
  bins?: BinInfo[]; // Available bins for this product
  bin_adjustments?: BinAdjustment[]; // Calculated automatically on save
  selected_bin_ids?: Set<string>; // Track which bins are selected for this item
}

export interface InventoryAdjustment {
  id: string;
  adjustment_type: 'ADD' | 'REMOVE' | 'REPLACE';
  reason_id?: string;
  custom_reason?: string;
  notes?: string;
  adjusted_by: string;
  adjustment_date: string;
  status: 'DRAFT' | 'COMPLETED' | 'CANCELLED';
  created_at: string;
  items?: AdjustmentItem[];
}

export interface AdjustmentLog {
  id: string;
  adjustment_id: string;
  adjusted_by: string;
  adjusted_by_name: string;
  product_id: string;
  sku: string;
  product_name: string;
  product_details: any;
  adjustment_type: string;
  reason_id?: string;
  reason_name?: string;
  quantity_before: number;
  adjustment_quantity: number;
  quantity_after: number;
  notes?: string;
  created_at: string;
}

/**
 * Get all active adjustment reasons
 */
export async function getAdjustmentReasons(): Promise<AdjustmentReason[]> {
  const { data, error } = await supabase
    .from('inventory_adjustment_reasons')
    .select('*')
    .eq('is_active', true)
    .order('reason_name');

  if (error) throw error;
  return data || [];
}

/**
 * Create a new adjustment reason
 */
export async function createAdjustmentReason(
  reasonName: string,
  description?: string
): Promise<AdjustmentReason> {
  const { data, error } = await supabase
    .from('inventory_adjustment_reasons')
    .insert({
      reason_name: reasonName,
      description,
      is_active: true
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Search products by SKU, name, or other fields
 */
export async function searchProducts(query: string): Promise<any[]> {
  if (!query.trim()) return [];

  const searchTerm = `%${query.trim()}%`;

  const { data, error } = await supabase
    .from('product_master')
    .select('*')
    .or(`sku.ilike.${searchTerm},name.ilike.${searchTerm},class.ilike.${searchTerm},color.ilike.${searchTerm}`)
    .limit(20);

  if (error) throw error;
  return data || [];
}

/**
 * Get product by SKU (for barcode scanning)
 */
export async function getProductBySKU(sku: string): Promise<any | null> {
  const { data, error } = await supabase
    .from('product_master')
    .select('*')
    .eq('sku', sku.trim())
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // No rows returned
    throw error;
  }
  return data;
}

/**
 * Get current stock for a product
 */
export async function getProductStock(productId: string): Promise<number> {
  const { data, error } = await supabase
    .from('product_master')
    .select('current_stock')
    .eq('id', productId)
    .single();

  if (error) throw error;
  return parseFloat(data?.current_stock || '0');
}

/**
 * Get all bins (even without inventory) and check inventory for a specific product
 */
export async function getBinsForProduct(productId: string, itemCode?: string): Promise<BinInfo[]> {
  try {
    // First, get ALL active bins with their warehouse, floor, and rack relationships
    const { data: allBins, error: binsError } = await supabase
      .from('bins')
      .select(`
        id,
        bin_code,
        location_type,
        is_active,
        rack:rack_id (
          id,
          rack_code,
          is_active,
          floor:floor_id (
            id,
            floor_number,
            is_active,
            warehouse:warehouse_id (
              id,
              name,
              is_active
            )
          )
        )
      `)
      .eq('is_active', true);

    if (binsError) {
      console.error('Error fetching bins:', binsError);
      return [];
    }

    if (!allBins || allBins.length === 0) {
      return [];
    }

    // Now, get inventory quantities for this product from warehouse_inventory
    const { data: inventoryData, error: inventoryError } = await supabase
      .from('warehouse_inventory')
      .select('bin_id, quantity')
      .eq('item_type', 'PRODUCT')
      .eq('item_id', productId);

    if (inventoryError) {
      console.error('Error fetching inventory:', inventoryError);
      // Continue anyway - we'll just show 0 for all bins
    }

    // Create a map of bin_id to total quantity
    const inventoryMap = new Map<string, number>();
    if (inventoryData && inventoryData.length > 0) {
      inventoryData.forEach((item: any) => {
        const binId = item.bin_id;
        const quantity = parseFloat(item.quantity || '0');
        const currentQty = inventoryMap.get(binId) || 0;
        inventoryMap.set(binId, currentQty + quantity);
      });
    }

    // Transform all bins to BinInfo format
    const bins: BinInfo[] = (allBins as any[])
      .filter((bin: any) => {
        // Filter out bins where parent relationships are inactive
        const rack = bin.rack;
        const floor = rack?.floor;
        const warehouse = floor?.warehouse;
        return rack?.is_active !== false && 
               floor?.is_active !== false && 
               warehouse?.is_active !== false;
      })
      .map((bin: any) => {
        const rack = bin.rack;
        const floor = rack?.floor;
        const warehouse = floor?.warehouse;

        // Get quantity for this bin (0 if no inventory)
        const currentQuantity = inventoryMap.get(bin.id) || 0;

        return {
          bin_id: bin.id,
          bin_code: bin.bin_code || 'Unknown',
          warehouse_name: warehouse?.name,
          floor_number: floor?.floor_number,
          rack_code: rack?.rack_code,
          location_type: bin.location_type,
          current_quantity: currentQuantity
        };
      });

    // Sort bins by warehouse, floor, rack, then bin code
    bins.sort((a, b) => {
      if (a.warehouse_name !== b.warehouse_name) {
        return (a.warehouse_name || '').localeCompare(b.warehouse_name || '');
      }
      if ((a.floor_number || 0) !== (b.floor_number || 0)) {
        return (a.floor_number || 0) - (b.floor_number || 0);
      }
      if (a.rack_code !== b.rack_code) {
        return (a.rack_code || '').localeCompare(b.rack_code || '');
      }
      return (a.bin_code || '').localeCompare(b.bin_code || '');
    });

    return bins;
  } catch (error) {
    console.error('Error in getBinsForProduct:', error);
    return [];
  }
}

/**
 * Get employee ID from auth user ID
 * First tries to find employee by user_id, then by email
 * Returns null if employee record not found (allows adjustment to proceed with user_id only)
 */
async function getEmployeeIdFromUserId(userId: string, userEmail?: string): Promise<string | null> {
  try {
    // First, try to find employee by user_id (if employees table has user_id field)
    const { data: employeeByUserId, error: error1 } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    
    // Only proceed if no error and data exists
    // If error is about column not existing (e.g., 400 Bad Request), we'll skip
    if (!error1 && employeeByUserId?.id) {
      return employeeByUserId.id;
    }
    
    // If error indicates column doesn't exist, try next method
    // If not found by user_id, try by personal_email (most common field in employees table)
    if (userEmail) {
      const { data: employeeByPersonalEmail, error: error3 } = await supabase
        .from('employees')
        .select('id')
        .eq('personal_email', userEmail)
        .maybeSingle();
      
      if (!error3 && employeeByPersonalEmail?.id) {
        return employeeByPersonalEmail.id;
      }
    }
  } catch (error: any) {
    // If all queries fail, return null - adjustment can still proceed with user_id only
    console.log('Unable to find employee record (this is okay):', error?.message || error);
  }
  
  // Return null if no employee found - this is acceptable
  // The adjustment will be saved with adjusted_by_user_id only
  return null;
}

/**
 * Create inventory adjustment
 */
export async function createInventoryAdjustment(
  adjustmentType: 'ADD' | 'REMOVE' | 'REPLACE',
  items: AdjustmentItem[],
  reasonId?: string,
  customReason?: string,
  notes?: string,
  userId: string,
  userEmail?: string
): Promise<{ adjustmentId: string; items: AdjustmentItem[] }> {
  // Get employee ID from user ID (optional - will be null if not found)
  const employeeId = await getEmployeeIdFromUserId(userId, userEmail);
  
  // Create adjustment record
  // adjusted_by can be null if employee record not found, but we'll store user_id for reference
  const adjustmentData: any = {
    adjustment_type: adjustmentType,
    reason_id: reasonId,
    custom_reason: customReason,
    notes,
    adjusted_by_user_id: userId, // Always store auth user ID for reference
    status: 'DRAFT'
  };
  
  // Only add adjusted_by if employee ID was found
  if (employeeId) {
    adjustmentData.adjusted_by = employeeId;
  }
  
  const { data: adjustment, error: adjustmentError } = await supabase
    .from('inventory_adjustments')
    .insert(adjustmentData)
    .select()
    .single();

  if (adjustmentError) throw adjustmentError;

  // Create adjustment items
  const itemsToInsert = items.map(item => ({
    adjustment_id: adjustment.id,
    product_id: item.product_id,
    sku: item.sku,
    product_name: item.product_name,
    product_class: item.product_class,
    product_color: item.product_color,
    product_size: item.product_size,
    product_category: item.product_category,
    product_brand: item.product_brand,
    quantity_before: item.quantity_before,
    adjustment_quantity: item.adjustment_quantity,
    quantity_after: item.quantity_after,
    replace_quantity: item.replace_quantity,
    unit: item.unit || 'pcs'
  }));

  const { data: insertedItems, error: itemsError } = await supabase
    .from('inventory_adjustment_items')
    .insert(itemsToInsert)
    .select();

  if (itemsError) throw itemsError;

  // Create bin-level adjustments if any
  if (insertedItems && insertedItems.length > 0) {
    const binAdjustmentsToInsert: any[] = [];
    
    items.forEach((item, itemIndex) => {
      const insertedItem = insertedItems[itemIndex];
      // bin_adjustments should already be calculated and populated before calling this function
      if (item.bin_adjustments && item.bin_adjustments.length > 0) {
        item.bin_adjustments.forEach(binAdj => {
          binAdjustmentsToInsert.push({
            adjustment_item_id: insertedItem.id,
            bin_id: binAdj.bin_id,
            quantity_before: binAdj.quantity_before,
            adjustment_quantity: binAdj.adjustment_quantity,
            quantity_after: binAdj.quantity_after
          });
        });
      }
    });

    if (binAdjustmentsToInsert.length > 0) {
      const { error: binsError } = await supabase
        .from('inventory_adjustment_bins')
        .insert(binAdjustmentsToInsert);

      if (binsError) {
        console.error('Error inserting bin adjustments:', binsError);
        // Don't throw - allow adjustment to proceed without bin adjustments
      }
    }
  }

  // Execute the adjustment (update inventory and create logs)
  const { data: result, error: executeError } = await supabase.rpc(
    'execute_inventory_adjustment',
    {
      p_adjustment_id: adjustment.id,
      p_user_id: userId
    }
  );

  if (executeError) {
    console.error('RPC Error:', executeError);
    throw new Error(executeError.message || 'Failed to execute adjustment');
  }

  // Handle result - it might be JSONB or plain object
  const resultData = typeof result === 'string' ? JSON.parse(result) : result;
  
  if (resultData && resultData.success === false) {
    const errors = Array.isArray(resultData.errors) 
      ? resultData.errors.join(', ') 
      : (resultData.errors || 'Failed to execute adjustment');
    throw new Error(errors);
  }

  return {
    adjustmentId: adjustment.id,
    items: insertedItems || []
  };
}

/**
 * Get adjustment history
 */
export async function getAdjustmentHistory(filters?: {
  startDate?: string;
  endDate?: string;
  userId?: string;
  adjustmentType?: string;
  limit?: number;
}): Promise<InventoryAdjustment[]> {
  let query = supabase
    .from('inventory_adjustments')
    .select(`
      *,
      items:inventory_adjustment_items(*),
      reason:inventory_adjustment_reasons(reason_name)
    `)
    .order('adjustment_date', { ascending: false });

  if (filters?.startDate) {
    query = query.gte('adjustment_date', filters.startDate);
  }

  if (filters?.endDate) {
    query = query.lte('adjustment_date', filters.endDate);
  }

  if (filters?.userId) {
    query = query.eq('adjusted_by', filters.userId);
  }

  if (filters?.adjustmentType) {
    query = query.eq('adjustment_type', filters.adjustmentType);
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  } else {
    query = query.limit(100);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

/**
 * Get adjustment logs for a specific adjustment
 */
export async function getAdjustmentLogs(adjustmentId: string): Promise<AdjustmentLog[]> {
  const { data, error } = await supabase
    .from('inventory_adjustment_logs')
    .select('*')
    .eq('adjustment_id', adjustmentId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

