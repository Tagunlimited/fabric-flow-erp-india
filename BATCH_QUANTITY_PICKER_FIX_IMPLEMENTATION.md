# Batch Quantity and Picker Visibility Fix Implementation

## Overview

This document explains the implementation of fixes for two critical issues in the production workflow:

1. **Cutting Manager - Completed Jobs Tab**: Batch quantities showing as 0 despite job being 100% complete
2. **Picker Interface**: Assigned orders not visible to tailors

## Issues Identified

### Issue 1: Batch Quantity Showing 0

**Root Cause**: The `order_batch_assignments_with_details` view was not properly calculating `total_quantity` from the `order_batch_size_distributions` table. The view was relying on the `total_quantity` field in `order_batch_assignments`, which was not being updated correctly after our previous fix to `DistributeQuantityDialog.tsx`.

**Impact**: 
- Completed jobs in Cutting Manager showed "B1 (0 pieces)" instead of "B1 (46 pieces)"
- Misleading information for production managers
- Inability to track actual batch quantities

### Issue 2: Picker Not Showing Assigned Orders

**Root Cause**: The picker interface (`PickerPage.tsx`) fetches batch assignments from `order_batch_assignments_with_details` view, but the view was not properly aggregating quantities and the RLS policies might have been too restrictive.

**Impact**:
- Tailors couldn't see orders assigned to their batches
- Production workflow disruption
- Inability to pick materials for assigned orders

## Solution Implemented

### Step 1: Updated order_batch_assignments_with_details View

**File**: `supabase/migrations/20250122000000_fix_batch_quantity_and_picker_visibility.sql`

**Key Changes**:
1. **Proper Quantity Calculation**: The view now calculates `total_quantity` by summing from `order_batch_size_distributions`:
   ```sql
   COALESCE(SUM(obsd.quantity), 0) as total_quantity
   ```

2. **Added Picked/Rejected Quantities**: The view now also calculates:
   ```sql
   COALESCE(SUM(obsd.picked_quantity), 0) as total_picked_quantity,
   COALESCE(SUM(obsd.rejected_quantity), 0) as total_rejected_quantity
   ```

3. **Improved Size Distributions**: The JSON aggregation now includes all relevant fields:
   ```sql
   json_build_object(
       'size_name', obsd.size_name,
       'quantity', obsd.quantity,
       'picked_quantity', COALESCE(obsd.picked_quantity, 0),
       'rejected_quantity', COALESCE(obsd.rejected_quantity, 0),
       'status', COALESCE(obsd.status, 'pending')
   )
   ```

### Step 2: Fixed RLS Policies

**Policies Added**:
```sql
-- Allow users to view batch assignments
CREATE POLICY IF NOT EXISTS "Allow users to view batch assignments"
ON order_batch_assignments FOR SELECT
USING (true);

-- Allow users to view batches
CREATE POLICY IF NOT EXISTS "Allow users to view batches"
ON batches FOR SELECT
USING (true);

-- Allow users to view size distributions
CREATE POLICY IF NOT EXISTS "Allow users to view size distributions"
ON order_batch_size_distributions FOR SELECT
USING (true);
```

### Step 3: Data Integrity Update

**Backfill Script**: The migration includes an UPDATE statement to fix existing records:
```sql
UPDATE order_batch_assignments
SET total_quantity = (
    SELECT COALESCE(SUM(quantity), 0)
    FROM order_batch_size_distributions
    WHERE order_batch_assignment_id = order_batch_assignments.id
)
WHERE id IN (
    SELECT oba.id
    FROM order_batch_assignments oba
    LEFT JOIN order_batch_size_distributions obsd ON obsd.order_batch_assignment_id = oba.id
    GROUP BY oba.id
    HAVING oba.total_quantity != COALESCE(SUM(obsd.quantity), 0)
);
```

## Files Modified

1. **`supabase/migrations/20250122000000_fix_batch_quantity_and_picker_visibility.sql`**
   - Main migration file with all fixes

2. **`test_batch_quantity_fixes.sql`**
   - Test script to verify the fixes

3. **`fix_batch_quantity_and_picker_visibility.sql`**
   - Standalone SQL script (backup)

## Testing

### Test Script Created

The `test_batch_quantity_fixes.sql` script includes:

1. **Data Integrity Check**: Verifies that stored totals match calculated totals
2. **View Test**: Confirms the view returns correct quantities
3. **RLS Policy Check**: Ensures proper policies are in place
4. **Zero Quantity Check**: Identifies any remaining issues

### Manual Testing Steps

1. **Cutting Manager Test**:
   - Navigate to Cutting Manager → Completed Jobs tab
   - Verify batch quantities show correct totals (e.g., "B1 (46 pieces)")
   - Check that quantities match the job progress

2. **Picker Test**:
   - Log in as a tailor with batch assignments
   - Navigate to Picker interface
   - Verify assigned orders are visible
   - Confirm size distributions display correctly

3. **New Assignment Test**:
   - Create a new order
   - Assign to a batch using DistributeQuantityDialog
   - Verify quantities appear correctly in both interfaces

## Expected Outcomes

### Issue 1: Cutting Manager Batch Quantity
- ✅ "Assigned Batches" column shows correct quantities (e.g., "B1 (46 pieces)")
- ✅ Quantities are calculated from `order_batch_size_distributions`
- ✅ Completed jobs display accurate batch information

### Issue 2: Picker Visibility
- ✅ Tailors can see all orders assigned to their batches
- ✅ RLS policies allow proper data access
- ✅ Batch assignments are correctly linked to orders

## Rollback Plan

If issues arise, the migration can be rolled back by:

1. **Revert the View**:
   ```sql
   -- Restore previous view definition
   CREATE OR REPLACE VIEW order_batch_assignments_with_details AS
   -- [Previous definition]
   ```

2. **Remove Policies** (if needed):
   ```sql
   DROP POLICY IF EXISTS "Allow users to view batch assignments" ON order_batch_assignments;
   DROP POLICY IF EXISTS "Allow users to view batches" ON batches;
   DROP POLICY IF EXISTS "Allow users to view size distributions" ON order_batch_size_distributions;
   ```

## Monitoring

After implementation, monitor:

1. **Cutting Manager**: Check that batch quantities display correctly
2. **Picker Interface**: Verify tailors can see their assignments
3. **Performance**: Ensure the view performs well with large datasets
4. **Data Consistency**: Run the test script periodically to check data integrity

## Related Components

- **CuttingManagerPage.tsx**: Displays batch quantities in Completed Jobs tab
- **PickerPage.tsx**: Shows assigned orders to tailors
- **DistributeQuantityDialog.tsx**: Creates batch assignments (previously fixed)
- **order_batch_assignments**: Main table for batch assignments
- **order_batch_size_distributions**: Size-wise quantity distribution table
- **batches**: Batch master table

## Success Criteria

The fix is successful when:

1. ✅ Cutting Manager shows correct batch quantities (not 0)
2. ✅ Picker interface displays assigned orders to tailors
3. ✅ All test queries return PASS status
4. ✅ No performance degradation in production
5. ✅ Data integrity maintained across all batch assignments
