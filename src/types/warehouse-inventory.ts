// Warehouse Inventory Tracking Types

export type InventoryStatus = 
  | 'RECEIVED'
  | 'IN_STORAGE'
  | 'READY_TO_DISPATCH'
  | 'DISPATCHED'
  | 'QUARANTINED';

export type WarehouseItemType = 
  | 'FABRIC'
  | 'ITEM'
  | 'PRODUCT';

export type MovementType = 
  | 'TRANSFER'
  | 'DISPATCH'
  | 'QUARANTINE';

export interface WarehouseInventory {
  id: string;
  grn_id: string;
  grn_item_id: string;
  item_type: WarehouseItemType;
  item_id: string;
  item_name: string;
  item_code: string;
  quantity: number;
  unit: string;
  bin_id: string;
  status: InventoryStatus;
  received_date: string;
  moved_to_storage_date?: string;
  dispatched_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  
  // Related data
  bin?: {
    id: string;
    bin_code: string;
    location_type: string;
    rack?: {
      id: string;
      rack_code: string;
      floor?: {
        id: string;
        floor_number: number;
        warehouse?: {
          id: string;
          name: string;
          code: string;
        };
      };
    };
  };
}

export interface InventoryMovement {
  id: string;
  inventory_id: string;
  from_bin_id?: string;
  to_bin_id: string;
  quantity: number;
  movement_type: MovementType;
  reason?: string;
  moved_by?: string;
  moved_at: string;
  notes?: string;
  
  // Related data
  inventory?: WarehouseInventory;
  from_bin?: {
    id: string;
    bin_code: string;
    location_type: string;
  };
  to_bin?: {
    id: string;
    bin_code: string;
    location_type: string;
  };
}

export interface InventoryTransferData {
  inventory_id: string;
  from_bin_id: string;
  to_bin_id: string;
  quantity: number;
  reason?: string;
  notes?: string;
}

export interface Bin {
  id: string;
  bin_code: string;
  location_type: string;
  rack?: {
    id: string;
    rack_code: string;
    floor?: {
      id: string;
      floor_number: number;
      warehouse?: {
        id: string;
        name: string;
        code: string;
      };
    };
  };
}

export interface BinInventorySummary {
  bin_id: string;
  bin_code: string;
  location_type: string;
  total_items: number;
  total_quantity: number;
  items: WarehouseInventory[];
  warehouse_path: string; // "Warehouse > Floor > Rack > Bin"
}

export interface InventoryStats {
  total_received_items: number;
  total_in_storage: number;
  total_ready_to_dispatch: number;
  total_dispatched: number;
  total_quarantined: number;
  receiving_zone_utilization: number;
  storage_zone_utilization: number;
  dispatch_zone_utilization: number;
}

// Status configuration for UI
export interface InventoryStatusConfig {
  status: InventoryStatus;
  label: string;
  color: string;
  bgColor: string;
  icon: string;
  description: string;
}

export const INVENTORY_STATUS_CONFIGS: Record<InventoryStatus, InventoryStatusConfig> = {
  RECEIVED: {
    status: 'RECEIVED',
    label: 'Received',
    color: 'text-blue-800',
    bgColor: 'bg-blue-100',
    icon: 'Package',
    description: 'Item received and placed in receiving zone'
  },
  IN_STORAGE: {
    status: 'IN_STORAGE',
    label: 'In Storage',
    color: 'text-green-800',
    bgColor: 'bg-green-100',
    icon: 'Archive',
    description: 'Item moved to storage zone'
  },
  READY_TO_DISPATCH: {
    status: 'READY_TO_DISPATCH',
    label: 'Ready to Dispatch',
    color: 'text-orange-800',
    bgColor: 'bg-orange-100',
    icon: 'Truck',
    description: 'Item ready for dispatch'
  },
  DISPATCHED: {
    status: 'DISPATCHED',
    label: 'Dispatched',
    color: 'text-gray-800',
    bgColor: 'bg-gray-100',
    icon: 'CheckCircle',
    description: 'Item has been dispatched'
  },
  QUARANTINED: {
    status: 'QUARANTINED',
    label: 'Quarantined',
    color: 'text-red-800',
    bgColor: 'bg-red-100',
    icon: 'AlertTriangle',
    description: 'Item quarantined for quality issues'
  }
};

// Item type configuration for UI
export interface ItemTypeConfig {
  type: WarehouseItemType;
  label: string;
  color: string;
  bgColor: string;
  icon: string;
}

export const ITEM_TYPE_CONFIGS: Record<WarehouseItemType, ItemTypeConfig> = {
  FABRIC: {
    type: 'FABRIC',
    label: 'Fabric',
    color: 'text-purple-800',
    bgColor: 'bg-purple-100',
    icon: 'Square'
  },
  ITEM: {
    type: 'ITEM',
    label: 'Item',
    color: 'text-blue-800',
    bgColor: 'bg-blue-100',
    icon: 'Package'
  },
  PRODUCT: {
    type: 'PRODUCT',
    label: 'Product',
    color: 'text-green-800',
    bgColor: 'bg-green-100',
    icon: 'Box'
  }
};
