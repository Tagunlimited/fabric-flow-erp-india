// Warehouse Master TypeScript Interfaces
// Hierarchical structure: Warehouse → Floor → Rack → Bin

/** Warehouse bins are storage-only in active flows. */
export type LocationType = 'STORAGE';

/** Values that may still exist on older seeded rows (read/display compatibility). */
export type LegacyBinLocationType = LocationType | 'DISPATCH_ZONE';

export interface Dimensions {
  length: number;
  width: number;
  height: number;
}

export interface Bin {
  id: string;
  rack_id: string;
  bin_code: string;
  location_type: LegacyBinLocationType;
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
  STORAGE: {
    type: 'STORAGE',
    label: 'Storage',
    color: 'text-green-800',
    bgColor: 'bg-green-100',
    icon: 'Archive',
    description: 'Main storage area for organized inventory'
  },
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
