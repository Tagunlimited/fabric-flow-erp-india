import { supabase } from '@/integrations/supabase/client';

export type InventoryLogAction = 
  | 'ADDED' 
  | 'CONSOLIDATED' 
  | 'REMOVED' 
  | 'ADJUSTED' 
  | 'TRANSFERRED' 
  | 'STATUS_CHANGED';

export type InventoryLogReferenceType = 
  | 'GRN' 
  | 'PRODUCTION' 
  | 'CUTTING' 
  | 'TRANSFER' 
  | 'ADJUSTMENT' 
  | 'DISPATCH' 
  | 'PICKING'
  | 'MANUAL';

export interface CreateInventoryLogParams {
  warehouse_inventory_id: string;
  item_type: string;
  item_id?: string | null;
  item_name: string;
  item_code: string;
  quantity: number; // Positive for additions, negative for removals
  old_quantity?: number;
  new_quantity?: number;
  unit: string;
  bin_id?: string | null;
  from_bin_id?: string | null;
  to_bin_id?: string | null;
  status?: string;
  old_status?: string;
  new_status?: string;
  color?: string | null;
  action: InventoryLogAction;
  reference_type?: InventoryLogReferenceType;
  reference_id?: string | null;
  reference_number?: string | null;
  grn_id?: string | null;
  grn_item_id?: string | null;
  notes?: string | null;
}

/**
 * Creates an inventory log entry for tracking inventory changes
 */
export async function createInventoryLog(params: CreateInventoryLogParams): Promise<void> {
  try {
    const logData: any = {
      warehouse_inventory_id: params.warehouse_inventory_id,
      item_type: params.item_type,
      item_id: params.item_id || null,
      item_name: params.item_name,
      item_code: params.item_code,
      quantity: params.quantity,
      old_quantity: params.old_quantity ?? null,
      new_quantity: params.new_quantity ?? null,
      unit: params.unit,
      bin_id: params.bin_id || null,
      from_bin_id: params.from_bin_id || null,
      to_bin_id: params.to_bin_id || null,
      status: params.status || 'RECEIVED',
      old_status: params.old_status || null,
      new_status: params.new_status || null,
      color: params.color || null,
      action: params.action,
      reference_type: params.reference_type || null,
      reference_id: params.reference_id || null,
      reference_number: params.reference_number || null,
      grn_id: params.grn_id || null,
      grn_item_id: params.grn_item_id || null,
      notes: params.notes || null,
    };

    const { error } = await supabase
      .from('inventory_logs')
      .insert(logData);

    if (error) {
      console.error('Error creating inventory log:', error);
      // Don't throw - logging is not critical to the main operation
    } else {
      console.log(`Created inventory log: ${params.action} for ${params.item_name}`);
    }
  } catch (error) {
    console.error('Exception creating inventory log:', error);
    // Don't throw - logging is not critical
  }
}

/**
 * Helper to log an inventory addition
 */
export async function logInventoryAddition(
  warehouse_inventory_id: string,
  item: { item_type: string; item_id?: string; item_name: string; item_code: string; unit: string },
  quantity: number,
  options?: {
    bin_id?: string;
    status?: string;
    color?: string;
    grn_id?: string;
    grn_item_id?: string;
    action?: 'ADDED' | 'CONSOLIDATED';
    old_quantity?: number;
    new_quantity?: number;
    notes?: string;
  }
): Promise<void> {
  return createInventoryLog({
    warehouse_inventory_id,
    item_type: item.item_type === 'fabric' ? 'FABRIC' : item.item_type === 'product' ? 'PRODUCT' : 'ITEM',
    item_id: item.item_id || null,
    item_name: item.item_name,
    item_code: item.item_code,
    quantity: Math.abs(quantity), // Always positive for additions
    old_quantity: options?.old_quantity ?? null,
    new_quantity: options?.new_quantity ?? null,
    unit: item.unit,
    bin_id: options?.bin_id || null,
    status: options?.status || 'RECEIVED',
    color: options?.color || null,
    action: options?.action || 'ADDED',
    grn_id: options?.grn_id || null,
    grn_item_id: options?.grn_item_id || null,
    reference_type: 'GRN',
    notes: options?.notes || null,
  });
}

/**
 * Helper to log an inventory removal
 */
export async function logInventoryRemoval(
  warehouse_inventory_id: string,
  item: { item_type: string; item_id?: string; item_name: string; item_code: string; unit: string },
  quantity: number,
  old_quantity: number,
  new_quantity: number,
  options?: {
    bin_id?: string;
    status?: string;
    color?: string;
    reference_type?: InventoryLogReferenceType;
    reference_id?: string;
    reference_number?: string;
    notes?: string;
  }
): Promise<void> {
  return createInventoryLog({
    warehouse_inventory_id,
    item_type: item.item_type,
    item_id: item.item_id || null,
    item_name: item.item_name,
    item_code: item.item_code,
    quantity: -Math.abs(quantity), // Negative for removals
    old_quantity,
    new_quantity,
    unit: item.unit,
    bin_id: options?.bin_id || null,
    status: options?.status || 'RECEIVED',
    color: options?.color || null,
    action: 'REMOVED',
    reference_type: options?.reference_type || 'PRODUCTION',
    reference_id: options?.reference_id || null,
    reference_number: options?.reference_number || null,
    notes: options?.notes || null,
  });
}

/**
 * Helper to log an inventory adjustment
 */
export async function logInventoryAdjustment(
  warehouse_inventory_id: string,
  item: { item_type: string; item_id?: string; item_name: string; item_code: string; unit: string },
  old_quantity: number,
  new_quantity: number,
  options?: {
    bin_id?: string;
    status?: string;
    color?: string;
    notes?: string;
  }
): Promise<void> {
  const quantityChange = new_quantity - old_quantity;
  return createInventoryLog({
    warehouse_inventory_id,
    item_type: item.item_type,
    item_id: item.item_id || null,
    item_name: item.item_name,
    item_code: item.item_code,
    quantity: quantityChange, // Can be positive or negative
    old_quantity,
    new_quantity,
    unit: item.unit,
    bin_id: options?.bin_id || null,
    status: options?.status || 'RECEIVED',
    color: options?.color || null,
    action: 'ADJUSTED',
    reference_type: 'ADJUSTMENT',
    notes: options?.notes || null,
  });
}

/**
 * Helper to log an inventory transfer
 */
export async function logInventoryTransfer(
  warehouse_inventory_id: string,
  item: { item_type: string; item_id?: string; item_name: string; item_code: string; unit: string },
  quantity: number,
  from_bin_id: string,
  to_bin_id: string,
  old_status?: string,
  new_status?: string,
  options?: {
    color?: string;
    notes?: string;
  }
): Promise<void> {
  return createInventoryLog({
    warehouse_inventory_id,
    item_type: item.item_type,
    item_id: item.item_id || null,
    item_name: item.item_name,
    item_code: item.item_code,
    quantity: quantity,
    unit: item.unit,
    from_bin_id,
    to_bin_id,
    old_status,
    new_status,
    color: options?.color || null,
    action: 'TRANSFERRED',
    reference_type: 'TRANSFER',
    notes: options?.notes || null,
  });
}

