-- DIRECT FIX: Batch Quantity and Picker Visibility
-- Execute this in Supabase Dashboard SQL Editor
-- URL: https://supabase.com/dashboard/project/vwpseddaghxktpjtriaj/sql/new

-- Step 1: Check current view definition
SELECT 
    'Current View Definition' as check_type,
    pg_get_viewdef('order_batch_assignments_with_details'::regclass, true) as view_definition;

-- Step 2: Check current data integrity
SELECT 
    'Data Integrity Check' as check_type,
    oba.id as assignment_id,
    o.order_number,
    b.batch_name,
    oba.total_quantity as stored_total,
    COALESCE(SUM(obsd.quantity), 0) as calculated_total,
    COUNT(obsd.id) as size_count,
    CASE 
        WHEN oba.total_quantity = COALESCE(SUM(obsd.quantity), 0) THEN 'PASS'
        ELSE 'FAIL - MISMATCH'
    END as status
FROM order_batch_assignments oba
JOIN orders o ON o.id = oba.order_id
JOIN batches b ON b.id = oba.batch_id
LEFT JOIN order_batch_size_distributions obsd ON obsd.order_batch_assignment_id = oba.id
GROUP BY oba.id, o.order_number, b.batch_name, oba.total_quantity
ORDER BY o.order_number;

-- Step 3: Drop and recreate the view to properly calculate total_quantity
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
    b.batch_leader_avatar_url as batch_leader_avatar,  -- Add backward compatibility alias
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
    -- Calculate picked quantities
    COALESCE(SUM(obsd.picked_quantity), 0) as total_picked_quantity,
    COALESCE(SUM(obsd.rejected_quantity), 0) as total_rejected_quantity,
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
-- Drop existing policies first, then create new ones
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

-- Step 6: Verify the fix
SELECT 
    'Fix Verification' as check_type,
    assignment_id,
    order_id,
    batch_name,
    total_quantity,
    total_picked_quantity,
    total_rejected_quantity,
    json_array_length(size_distributions) as size_count,
    CASE 
        WHEN total_quantity > 0 THEN 'PASS - HAS QUANTITY'
        ELSE 'FAIL - ZERO QUANTITY'
    END as status
FROM order_batch_assignments_with_details
WHERE total_quantity > 0
ORDER BY assignment_id;

-- Step 7: Final verification query
SELECT 
    'Final Check - Orders with Batch Assignments' as check_type,
    o.order_number,
    b.batch_name,
    oba.total_quantity,
    COALESCE(SUM(obsd.quantity), 0) as calculated_total,
    CASE 
        WHEN oba.total_quantity = COALESCE(SUM(obsd.quantity), 0) AND oba.total_quantity > 0 THEN 'FIXED ✅'
        WHEN oba.total_quantity = 0 AND COALESCE(SUM(obsd.quantity), 0) > 0 THEN 'STILL BROKEN ❌'
        ELSE 'NO DATA'
    END as fix_status
FROM order_batch_assignments oba
JOIN orders o ON o.id = oba.order_id
JOIN batches b ON b.id = oba.batch_id
LEFT JOIN order_batch_size_distributions obsd ON obsd.order_batch_assignment_id = oba.id
GROUP BY oba.id, o.order_number, b.batch_name, oba.total_quantity
ORDER BY o.order_number;

-- Success message
SELECT 'Batch quantity fix applied! Check Cutting Manager now.' as result;
