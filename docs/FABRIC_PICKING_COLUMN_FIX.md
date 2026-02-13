# Fabric Picking Column Name Fix

## Issue
The error "Could not find the 'picked_by_id' column of 'fabric_picking_records' in the schema cache" occurs because there's a mismatch between the component code and database schema.

## Root Cause
- **Component Code**: Uses `picked_by_id` and `picked_by_name` columns
- **Database Schema**: Had `picked_by` column instead of `picked_by_id`
- **Missing Column**: `picked_by_name` column was missing from the schema

## Solution

### 1. Updated Migration Files
I've updated the migration files to match the component expectations:

**Updated Columns:**
- `picked_by` → `picked_by_id` (UUID, references auth.users)
- Added `picked_by_name` (TEXT, stores user's display name)
- Added `storage_zone_id` (UUID, references fabric_storage_zones)
- Removed `source_warehouse_id` and `source_bin_id` (replaced with storage_zone_id)

### 2. New Migration File
Created `20250115000002_fix_fabric_picking_records_columns.sql` that:
- Drops and recreates the table with correct column names
- Ensures fabric_storage_zones table exists
- Sets up proper indexes and RLS policies

### 3. Files Modified
- `supabase/migrations/20250115000000_ensure_fabric_picking_records_table.sql`
- `supabase/migrations/20250115000001_ensure_fabric_tables_complete.sql`
- `supabase/migrations/20250115000002_fix_fabric_picking_records_columns.sql` (new)
- `test_fabric_picking_fix.sql` (test script)

## How to Apply the Fix

### Option 1: Using Supabase CLI (Recommended)
```bash
cd /Users/notfunny/fabric-flow-erp-india
npx supabase db push
```

### Option 2: Manual Database Execution
1. Connect to your Supabase database
2. Run the migration files in order:
   - `supabase/migrations/20250115000002_fix_fabric_picking_records_columns.sql`

### Option 3: Using the Test Script
```bash
cd /Users/notfunny/fabric-flow-erp-india
psql -h your-db-host -U your-username -d your-database -f test_fabric_picking_fix.sql
```

## Verification
After applying the migrations, verify the fix by:

1. **Check table structure:**
   ```sql
   SELECT column_name, data_type, is_nullable 
   FROM information_schema.columns 
   WHERE table_name = 'fabric_picking_records' 
   AND table_schema = 'public';
   ```

2. **Test the Fabric Picking Dialog:**
   - Navigate to the production section
   - Try to open the "Pick Fabric" dialog
   - The "picked_by_id" column error should be resolved

## Expected Table Structure
```sql
CREATE TABLE fabric_picking_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    fabric_id UUID REFERENCES fabrics(id) ON DELETE CASCADE,
    storage_zone_id UUID REFERENCES fabric_storage_zones(id) ON DELETE SET NULL,
    picked_quantity DECIMAL(10,2) NOT NULL,
    unit TEXT DEFAULT 'meters',
    picked_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    picked_by_name TEXT,
    picked_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Key Changes Made

### Column Mappings
- ✅ `picked_by` → `picked_by_id` (matches component)
- ✅ Added `picked_by_name` (stores user display name)
- ✅ Added `storage_zone_id` (replaces warehouse/bin references)
- ✅ Removed `source_warehouse_id` and `source_bin_id`

### Component Compatibility
- ✅ Matches the data structure expected by FabricPickingDialog.tsx
- ✅ Supports user name storage for better audit trails
- ✅ Uses storage zones instead of warehouse/bin references

### Database Integrity
- ✅ Proper foreign key relationships
- ✅ Row Level Security (RLS) enabled
- ✅ Comprehensive indexing for performance
- ✅ Audit fields (created_at, updated_at)

## Testing
The fix includes a test script that:
1. Verifies table structure
2. Tests inserting sample records
3. Confirms all columns exist with correct types

Run the test script to ensure everything is working correctly.

## Next Steps
1. Apply the migration using one of the methods above
2. Test the Fabric Picking Dialog functionality
3. Verify that fabric picking records are created successfully
4. Check that warehouse inventory is updated correctly

The "picked_by_id" column error should be completely resolved after applying these migrations.
