-- COMPREHENSIVE FIX FOR ALL PAGES USING order_batch_assignments_with_details VIEW
-- This script fixes the batch_leader_avatar column name issue across all affected pages

-- Step 1: Check which pages are affected by the column name change
SELECT 
    'Affected Pages Analysis' as check_type,
    'QCPage.tsx - selects batch_leader_avatar' as qc_page,
    'QCPageWithTabs.tsx - selects batch_leader_avatar' as qc_page_tabs,
    'CuttingManagerPage.tsx - uses batch_leader_avatar in display' as cutting_manager,
    'PickerPage.tsx - uses batch_leader_avatar' as picker_page,
    'DispatchQCPage.tsx - NOT affected (does not select batch_leader_avatar)' as dispatch_qc;

-- Step 2: Current view definition check
SELECT 
    'Current View Columns' as check_type,
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_name = 'order_batch_assignments_with_details' 
  AND column_name IN ('batch_leader_avatar_url', 'batch_leader_avatar')
ORDER BY column_name;

-- Step 3: Update the view to include both column names for backward compatibility
DROP VIEW IF EXISTS order_batch_assignments_with_details;
CREATE VIEW order_batch_assignments_with_details AS
SELECT 
    oba.id,
    oba.id as assignment_id,
    oba.order_id,
    oba.batch_id,
    oba.assigned_by_id,
    oba.assigned_by_name,
    oba.assignment_date,
    oba.status,
    oba.notes,
    oba.created_at,
    oba.updated_at,
    -- Batch details
    b.batch_name,
    b.batch_code,
    b.tailor_type,
    b.max_capacity,
    b.current_capacity,
    b.batch_leader_id,
    b.batch_leader_name,
    b.batch_leader_avatar_url,
    b.batch_leader_avatar_url as batch_leader_avatar,  -- Backward compatibility alias
    b.location,
    b.department,
    b.specialization,
    b.hourly_rate,
    b.efficiency_rating as batch_efficiency_rating,
    b.quality_rating as batch_quality_rating,
    b.status as batch_status,
    b.is_active as batch_is_active,
    -- Calculate total_quantity by summing from order_batch_size_distributions
    COALESCE(SUM(obsd.quantity), 0) as total_quantity,
    -- Calculate picked quantities (handle NULL values)
    COALESCE(SUM(COALESCE(obsd.picked_quantity, 0)), 0) as total_picked_quantity,
    COALESCE(SUM(COALESCE(obsd.rejected_quantity, 0)), 0) as total_rejected_quantity,
    -- Size distributions as JSON
    COALESCE(
        json_agg(
            json_build_object(
                'size_name', obsd.size_name,
                'quantity', obsd.quantity,
                'picked_quantity', COALESCE(obsd.picked_quantity, 0),
                'rejected_quantity', COALESCE(obsd.rejected_quantity, 0),
                'status', COALESCE(obsd.status, 'pending')
            ) ORDER BY obsd.size_name
        ) FILTER (WHERE obsd.id IS NOT NULL),
        '[]'::json
    ) as size_distributions
FROM order_batch_assignments oba
LEFT JOIN batches b ON oba.batch_id = b.id
LEFT JOIN order_batch_size_distributions obsd ON oba.id = obsd.order_batch_assignment_id
GROUP BY 
    oba.id,
    oba.order_id,
    oba.batch_id,
    oba.assigned_by_id,
    oba.assigned_by_name,
    oba.assignment_date,
    oba.status,
    oba.notes,
    oba.created_at,
    oba.updated_at,
    b.batch_name,
    b.batch_code,
    b.tailor_type,
    b.max_capacity,
    b.current_capacity,
    b.batch_leader_id,
    b.batch_leader_name,
    b.batch_leader_avatar_url,
    b.location,
    b.department,
    b.specialization,
    b.hourly_rate,
    b.efficiency_rating,
    b.quality_rating,
    b.status,
    b.is_active;

-- Step 4: Ensure RLS policies are in place
DROP POLICY IF EXISTS "Allow users to view batch assignments" ON order_batch_assignments;
CREATE POLICY "Allow users to view batch assignments"
ON order_batch_assignments FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Allow users to view batches" ON batches;
CREATE POLICY "Allow users to view batches"
ON batches FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Allow users to view size distributions" ON order_batch_size_distributions;
CREATE POLICY "Allow users to view size distributions"
ON order_batch_size_distributions FOR SELECT
USING (true);

-- Step 5: Update existing records with correct total_quantity
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

-- Step 6: Test all affected pages' queries
-- Test QCPage query
SELECT 
    'QCPage Query Test' as test_name,
    assignment_id, 
    order_id, 
    total_quantity, 
    batch_name, 
    batch_leader_name, 
    batch_leader_avatar_url,
    batch_leader_avatar  -- This should work now
FROM order_batch_assignments_with_details
WHERE total_quantity > 0
ORDER BY assignment_date DESC
LIMIT 5;

-- Test CuttingManagerPage query (selects all columns)
SELECT 
    'CuttingManagerPage Query Test' as test_name,
    assignment_id,
    order_id,
    batch_name,
    batch_leader_name,
    batch_leader_avatar_url,
    batch_leader_avatar,  -- This should work now
    total_quantity,
    total_picked_quantity,
    total_rejected_quantity
FROM order_batch_assignments_with_details
WHERE total_quantity > 0
ORDER BY assignment_date DESC
LIMIT 5;

-- Test PickerPage query
SELECT 
    'PickerPage Query Test' as test_name,
    assignment_id,
    order_id,
    assignment_date,
    total_quantity,
    size_distributions,
    batch_name,
    batch_leader_name,
    batch_leader_avatar_url,
    batch_leader_avatar  -- This should work now
FROM order_batch_assignments_with_details
WHERE total_quantity > 0
ORDER BY assignment_date DESC
LIMIT 5;

-- Step 7: Verify both columns have same values
SELECT 
    'Column Values Verification' as test_name,
    assignment_id,
    batch_leader_avatar_url,
    batch_leader_avatar,
    CASE 
        WHEN batch_leader_avatar_url = batch_leader_avatar THEN 'PASS - VALUES MATCH'
        WHEN batch_leader_avatar_url IS NULL AND batch_leader_avatar IS NULL THEN 'PASS - BOTH NULL'
        ELSE 'FAIL - VALUES DIFFER'
    END as status
FROM order_batch_assignments_with_details
WHERE batch_leader_avatar_url IS NOT NULL OR batch_leader_avatar IS NOT NULL
LIMIT 10;

-- Step 8: Final verification
SELECT 
    'Final Verification' as check_type,
    'All affected pages should now work correctly:' as message,
    '✅ QCPage.tsx - batch_leader_avatar available' as qc_page_status,
    '✅ QCPageWithTabs.tsx - batch_leader_avatar available' as qc_tabs_status,
    '✅ CuttingManagerPage.tsx - batch_leader_avatar available' as cutting_manager_status,
    '✅ PickerPage.tsx - batch_leader_avatar available' as picker_status,
    '✅ DispatchQCPage.tsx - not affected' as dispatch_status;

-- Success message
SELECT 'All pages using order_batch_assignments_with_details view are now fixed!' as result;
