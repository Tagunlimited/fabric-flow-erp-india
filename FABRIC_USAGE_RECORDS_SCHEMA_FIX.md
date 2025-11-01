# Fabric Usage Records Schema Fix

## Issue Description

The `UpdateCuttingQuantityDialog.tsx` component was failing to save cutting quantities with the error:

```
Could not find the 'cutting_quantity' column of 'fabric_usage_records' in the schema cache
```

## Root Cause Analysis

The `fabric_usage_records` table was missing several columns that the frontend component expects:

1. **`cutting_quantity`** - Number of pieces cut using the fabric
2. **`used_quantity`** - Quantity of fabric used (meters/units) 
3. **`used_for_cutting_date`** - Date when fabric was used for cutting
4. **`used_by_id`** - User who used the fabric for cutting
5. **`used_by_name`** - Name of user who used the fabric

## Current Schema vs Expected Schema

### Current Schema (from migrations):
```sql
CREATE TABLE fabric_usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id),
    fabric_id UUID REFERENCES fabrics(id),
    planned_quantity DECIMAL(10,2),
    actual_quantity DECIMAL(10,2),
    wastage_quantity DECIMAL(10,2),
    unit TEXT DEFAULT 'meters',
    used_by UUID,
    used_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Expected Schema (what component needs):
```sql
CREATE TABLE fabric_usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id),
    fabric_id UUID REFERENCES fabrics(id),
    planned_quantity DECIMAL(10,2),
    actual_quantity DECIMAL(10,2),
    wastage_quantity DECIMAL(10,2),
    unit TEXT DEFAULT 'meters',
    used_by UUID,
    used_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- NEW COLUMNS NEEDED:
    cutting_quantity DECIMAL(10,2) DEFAULT 0,
    used_quantity DECIMAL(10,2) DEFAULT 0,
    used_for_cutting_date TIMESTAMPTZ,
    used_by_id UUID REFERENCES auth.users(id),
    used_by_name TEXT
);
```

## Solution

### SQL Migration Script
**File**: `fix_fabric_usage_records_cutting_quantity.sql`

The script adds the missing columns:

```sql
-- Add missing columns to fabric_usage_records table
ALTER TABLE fabric_usage_records 
ADD COLUMN IF NOT EXISTS cutting_quantity DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS used_quantity DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS used_for_cutting_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS used_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS used_by_name TEXT;

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_fabric_usage_records_cutting_quantity ON fabric_usage_records(cutting_quantity);
CREATE INDEX IF NOT EXISTS idx_fabric_usage_records_used_by_id ON fabric_usage_records(used_by_id);
CREATE INDEX IF NOT EXISTS idx_fabric_usage_records_used_for_cutting_date ON fabric_usage_records(used_for_cutting_date);
```

## Component Usage

The `UpdateCuttingQuantityDialog.tsx` component inserts records like this:

```typescript
const { error: fabricUsageError } = await supabase
  .from('fabric_usage_records')
  .insert({
    order_id: jobId,
    fabric_id: fabricUsage.fabric_id,
    used_quantity: fabricUsage.used_quantity,        // NEW COLUMN
    unit: pickedFabrics.find(f => f.fabric_id === fabricUsage.fabric_id)?.unit || 'meters',
    used_for_cutting_date: new Date().toISOString(),  // NEW COLUMN
    used_by_id: user?.id || null,                     // NEW COLUMN
    used_by_name: user?.user_metadata?.full_name || user?.email || 'System', // NEW COLUMN
    cutting_quantity: getTotalAdditionalCutQuantity(), // NEW COLUMN
    notes: `Cutting operation for ${getTotalAdditionalCutQuantity()} pieces`
  });
```

## How to Apply the Fix

1. **Run the SQL script** in your Supabase Dashboard:
   - Go to SQL Editor
   - Copy and paste the contents of `fix_fabric_usage_records_cutting_quantity.sql`
   - Execute the script

2. **Verify the fix**:
   - Try adding cutting quantities again
   - The error should be resolved
   - Fabric usage records should save successfully

## Expected Behavior After Fix

1. **Cutting Manager** can successfully add cutting quantities
2. **Fabric usage** is properly recorded with:
   - Number of pieces cut (`cutting_quantity`)
   - Fabric quantity used (`used_quantity`)
   - Date of cutting operation (`used_for_cutting_date`)
   - User who performed the cutting (`used_by_id`, `used_by_name`)
3. **No more schema errors** when saving cutting quantities

## Testing Checklist

- [ ] Run the SQL migration script
- [ ] Try adding cutting quantities for an order
- [ ] Verify no "cutting_quantity column not found" error
- [ ] Check that fabric usage records are created in database
- [ ] Verify all new columns are populated correctly
- [ ] Test with different fabric types and quantities

## Impact

- **Fixes**: Cutting quantity saving functionality
- **Enables**: Proper fabric usage tracking
- **Improves**: Data integrity for cutting operations
- **Non-breaking**: Existing data remains intact
