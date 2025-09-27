// Warehouse Master TypeScript Interfaces
// Hierarchical structure: Warehouse → Floor → Rack → Bin

export type LocationType = 
  | 'RECEIVING_ZONE'
  | 'STORAGE'
  | 'DISPATCH_ZONE';

export interface Dimensions {
  length: number;
  width: number;
  height: number;
}

export interface Bin {
  id: string;
  rack_id: string;
  bin_code: string;
  location_type: LocationType;
  is_active: boolean;
  dimensions?: Dimensions;
  created_at: string;
  updated_at: string;
}

export interface Rack {
  id: string;
  floor_id: string;
  rack_code: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  bins?: Bin[];
}

export interface Floor {
  id: string;
  warehouse_id: string;
  floor_number: number;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  racks?: Rack[];
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  floors?: Floor[];
}

// Form data interfaces
export interface WarehouseFormData {
  code: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_active: boolean;
}

export interface FloorFormData {
  warehouse_id: string;
  floor_number: number;
  description: string;
  is_active: boolean;
}

export interface RackFormData {
  floor_id: string;
  rack_code: string;
  description: string;
  is_active: boolean;
}

export interface BinFormData {
  rack_id: string;
  bin_code: string;
  location_type: LocationType;
  dimensions: Dimensions;
  is_active: boolean;
}

// Tree node interface for hierarchical display
export interface TreeNode {
  id: string;
  type: 'warehouse' | 'floor' | 'rack' | 'bin';
  label: string;
  code?: string;
  children?: TreeNode[];
  data: Warehouse | Floor | Rack | Bin;
  isExpanded?: boolean;
  isSelected?: boolean;
}

// Location type configuration for UI
export interface LocationTypeConfig {
  type: LocationType;
  label: string;
  color: string;
  bgColor: string;
  icon: string;
  description: string;
}

export const LOCATION_TYPE_CONFIGS: Record<LocationType, LocationTypeConfig> = {
  RECEIVING_ZONE: {
    type: 'RECEIVING_ZONE',
    label: 'Receiving Zone',
    color: 'text-blue-800',
    bgColor: 'bg-blue-100',
    icon: 'Package',
    description: 'Default zone for all received goods from GRN'
  },
  STORAGE: {
    type: 'STORAGE',
    label: 'Storage',
    color: 'text-green-800',
    bgColor: 'bg-green-100',
    icon: 'Archive',
    description: 'Main storage area for organized inventory'
  },
  DISPATCH_ZONE: {
    type: 'DISPATCH_ZONE',
    label: 'Dispatch Zone',
    color: 'text-orange-800',
    bgColor: 'bg-orange-100',
    icon: 'Truck',
    description: 'Staging area for goods ready to dispatch'
  }
};

// Warehouse statistics interface
export interface WarehouseStats {
  totalWarehouses: number;
  totalFloors: number;
  totalRacks: number;
  totalBins: number;
  activeWarehouses: number;
  activeFloors: number;
  activeRacks: number;
  activeBins: number;
  locationTypeDistribution: Record<LocationType, number>;
}

// Search and filter interfaces
export interface WarehouseFilters {
  search: string;
  isActive: boolean | null;
  locationType: LocationType | null;
  city: string | null;
  state: string | null;
}

export interface WarehouseSort {
  field: keyof Warehouse | keyof Floor | keyof Rack | keyof Bin;
  direction: 'asc' | 'desc';
}
