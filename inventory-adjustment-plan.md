# Inventory Adjustment Implementation Plan

## Overview
Implement a comprehensive inventory adjustment system where users can adjust product inventory quantities (Add, Remove, Replace) with reasons, barcode scanning support, and complete audit logging.

## Database Schema

### 1. Create `inventory_adjustment_reasons` Table
```sql
CREATE TABLE inventory_adjustment_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reason_name TEXT UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. Create `inventory_adjustments` Table
```sql
CREATE TABLE inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('ADD', 'REMOVE', 'REPLACE')),
  reason_id UUID REFERENCES inventory_adjustment_reasons(id),
  custom_reason TEXT,
  notes TEXT,
  adjusted_by UUID REFERENCES employees(id) NOT NULL,
  adjustment_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Status tracking
  status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'COMPLETED', 'CANCELLED'))
);
```

### 3. Create `inventory_adjustment_items` Table
```sql
CREATE TABLE inventory_adjustment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID REFERENCES inventory_adjustments(id) ON DELETE CASCADE,
  product_id UUID REFERENCES product_master(id) NOT NULL,
  sku TEXT NOT NULL,
  
  -- Product details snapshot (for historical tracking)
  product_name TEXT NOT NULL,
  product_class TEXT,
  product_color TEXT,
  product_size TEXT,
  product_category TEXT,
  product_brand TEXT,
  
  -- Quantity tracking
  quantity_before DECIMAL(10,2) NOT NULL,
  adjustment_quantity DECIMAL(10,2) NOT NULL,
  quantity_after DECIMAL(10,2) NOT NULL,
  
  -- Replace-specific
  replace_quantity DECIMAL(10,2), -- For REPLACE type
  
  unit TEXT DEFAULT 'pcs',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4. Create `inventory_adjustment_logs` Table (Audit Trail)
```sql
CREATE TABLE inventory_adjustment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID REFERENCES inventory_adjustments(id) ON DELETE CASCADE,
  
  -- User information
  adjusted_by UUID REFERENCES employees(id) NOT NULL,
  adjusted_by_name TEXT NOT NULL,
  
  -- Product information
  product_id UUID REFERENCES product_master(id),
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_details JSONB, -- Full product snapshot
  
  -- Adjustment details
  adjustment_type TEXT NOT NULL,
  reason_id UUID REFERENCES inventory_adjustment_reasons(id),
  reason_name TEXT,
  
  -- Quantity changes
  quantity_before DECIMAL(10,2) NOT NULL,
  adjustment_quantity DECIMAL(10,2) NOT NULL,
  quantity_after DECIMAL(10,2) NOT NULL,
  
  -- Metadata
  notes TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5. Create Indexes
```sql
CREATE INDEX idx_adjustment_reasons_active ON inventory_adjustment_reasons(is_active);
CREATE INDEX idx_adjustments_date ON inventory_adjustments(adjustment_date);
CREATE INDEX idx_adjustments_status ON inventory_adjustments(status);
CREATE INDEX idx_adjustment_items_sku ON inventory_adjustment_items(sku);
CREATE INDEX idx_adjustment_items_product ON inventory_adjustment_items(product_id);
CREATE INDEX idx_adjustment_logs_date ON inventory_adjustment_logs(created_at);
CREATE INDEX idx_adjustment_logs_sku ON inventory_adjustment_logs(sku);
```

### 6. RLS Policies
```sql
ALTER TABLE inventory_adjustment_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustment_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage
CREATE POLICY "Authenticated users can manage adjustment reasons"
  ON inventory_adjustment_reasons FOR ALL
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage adjustments"
  ON inventory_adjustments FOR ALL
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage adjustment items"
  ON inventory_adjustment_items FOR ALL
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can view adjustment logs"
  ON inventory_adjustment_logs FOR SELECT
  TO authenticated USING (true);
```

## Component Structure

### 1. Main Component: `InventoryAdjustment.tsx`
Location: `src/components/masters/InventoryAdjustment.tsx`

**Features:**
- Adjustment type selector (ADD, REMOVE, REPLACE)
- Reason selector with ability to create new reasons
- Barcode scanner input field
- Product search/select
- Selected products list with quantities
- Save adjustment button
- View adjustment history

**State Management:**
```typescript
interface AdjustmentItem {
  product_id: string;
  sku: string;
  product_name: string;
  class?: string;
  color?: string;
  size?: string;
  category?: string;
  brand?: string;
  quantity_before: number;
  adjustment_quantity: number;
  quantity_after: number;
  replace_quantity?: number; // For REPLACE type
}

interface AdjustmentState {
  adjustment_type: 'ADD' | 'REMOVE' | 'REPLACE';
  reason_id?: string;
  custom_reason?: string;
  notes?: string;
  items: AdjustmentItem[];
}
```

### 2. Sub-components:

#### `AdjustmentTypeSelector.tsx`
- Radio buttons or buttons for ADD/REMOVE/REPLACE
- Visual indicators

#### `ReasonManager.tsx`
- Dropdown to select existing reason
- Button to create new reason
- Dialog for creating new reason

#### `ProductSearchInput.tsx`
- Barcode input field (supports scanning)
- Manual SKU/product search
- Autocomplete with product details

#### `AdjustmentItemsList.tsx`
- Table/card view of selected products
- Shows all product details
- Quantity input for each item
- Remove item button
- Quantity validation

#### `AdjustmentHistory.tsx`
- View past adjustments
- Filter by date, user, reason, type
- Detailed logs for each adjustment

## Key Features Implementation

### 1. Barcode Scanning
- Use existing barcode scanning capabilities from barcode tab
- Input field that listens for barcode scanner input (auto-focus)
- Detect when scanner sends data (usually ends with Enter)
- Lookup product by SKU
- Auto-increment quantity if product already in list

### 2. Product Search
- Search by SKU, name, class, color
- Display product details when selected
- Prevent duplicates (update quantity instead)

### 3. Quantity Management
- Manual input for each product
- For ADD: Add quantity_before + adjustment_quantity
- For REMOVE: Subtract adjustment_quantity from quantity_before
- For REPLACE: Replace quantity_before with replace_quantity
- Validation: Can't remove more than available

### 4. Adjustment Execution
- Create adjustment record
- Create adjustment items records
- Update product_master.current_stock for each product
- Create log entries for each product
- Atomic transaction (all or nothing)

### 5. Logging
- Log every adjustment with full details
- Include user information
- Include product snapshot
- Include before/after quantities
- Include timestamp and metadata

## Implementation Steps

1. **Create Database Migration**
   - Create all tables
   - Set up indexes
   - Set up RLS policies
   - Create triggers for logging

2. **Create Reason Management Component**
   - CRUD for adjustment reasons
   - Default reasons: "Sold on Amazon", "Internally Used", "Rejected", "Damaged", "Returned"

3. **Create Product Search Component**
   - Integrate with product_master table
   - Barcode scanning support
   - Autocomplete functionality

4. **Create Adjustment Items List Component**
   - Display selected products
   - Quantity input handling
   - Remove item functionality

5. **Create Main Adjustment Component**
   - Combine all sub-components
   - Handle adjustment type selection
   - Handle reason selection
   - Handle save operation

6. **Create Adjustment History Component**
   - View past adjustments
   - Filter and search
   - Detailed view

7. **Integrate with ProductMasterNew**
   - Add InventoryAdjustment component to tab
   - Ensure proper state management

## API Functions Needed

### 1. Reason Management
```typescript
// Get all active reasons
async function getAdjustmentReasons(): Promise<Reason[]>

// Create new reason
async function createAdjustmentReason(name: string, description?: string): Promise<Reason>

// Update reason
async function updateAdjustmentReason(id: string, data: Partial<Reason>): Promise<Reason>
```

### 2. Product Lookup
```typescript
// Search products by SKU/name
async function searchProducts(query: string): Promise<Product[]>

// Get product by SKU (for barcode scanning)
async function getProductBySKU(sku: string): Promise<Product | null>

// Get current stock for product
async function getProductStock(productId: string): Promise<number>
```

### 3. Adjustment Operations
```typescript
// Create adjustment
async function createAdjustment(
  adjustment: AdjustmentState,
  userId: string
): Promise<{ adjustmentId: string; items: AdjustmentItem[] }>

// Get adjustment history
async function getAdjustmentHistory(filters?: {
  startDate?: string;
  endDate?: string;
  userId?: string;
  adjustmentType?: string;
}): Promise<Adjustment[]>
```

## Validation Rules

1. **Quantity Validation**
   - Adjustment quantity must be > 0
   - For REMOVE: adjustment_quantity <= quantity_before
   - For REPLACE: replace_quantity >= 0

2. **Product Validation**
   - Product must exist in product_master
   - SKU must be valid
   - Product must have current_stock field

3. **Adjustment Validation**
   - Must have at least one item
   - Must have adjustment_type
   - Must have reason or custom_reason
   - All items must have valid quantities

## Error Handling

- Handle invalid SKUs gracefully
- Handle products not found
- Handle insufficient stock for REMOVE
- Handle concurrent adjustments
- Transaction rollback on errors
- User-friendly error messages

## UI/UX Considerations

- Clear visual indicators for adjustment type
- Real-time quantity calculations
- Confirmation dialog before saving
- Success/error notifications
- Loading states during operations
- Responsive design for mobile use
- Keyboard shortcuts for efficiency

## Testing Checklist

- [ ] Create adjustment with ADD type
- [ ] Create adjustment with REMOVE type
- [ ] Create adjustment with REPLACE type
- [ ] Test barcode scanning
- [ ] Test manual SKU entry
- [ ] Test quantity validation
- [ ] Test insufficient stock handling
- [ ] Test reason creation
- [ ] Test adjustment history view
- [ ] Test concurrent adjustments
- [ ] Test logging accuracy
- [ ] Test inventory updates

