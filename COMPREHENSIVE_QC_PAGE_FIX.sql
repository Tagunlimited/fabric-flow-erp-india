-- COMPREHENSIVE QC PAGE FIX
-- This script fixes the issue where picked orders are not showing in QC page

-- Step 1: Ensure picked_quantity column exists and has proper defaults
ALTER TABLE order_batch_size_distributions 
ADD COLUMN IF NOT EXISTS picked_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rejected_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- Step 2: Update existing records to have proper defaults
UPDATE order_batch_size_distributions 
SET 
    picked_quantity = COALESCE(picked_quantity, 0),
    rejected_quantity = COALESCE(rejected_quantity, 0),
    status = COALESCE(status, 'pending')
WHERE picked_quantity IS NULL OR rejected_quantity IS NULL OR status IS NULL;

-- Step 3: Check if there are any assignments that should have picked quantities
-- but don't have them in the size distributions table
SELECT 
    'Missing Size Distributions Check' as check_type,
    oba.id as assignment_id,
    o.order_number,
    b.batch_name,
    oba.total_quantity,
    COUNT(obsd.id) as size_distribution_count,
    CASE 
        WHEN COUNT(obsd.id) = 0 THEN 'MISSING SIZE DISTRIBUTIONS'
        ELSE 'HAS SIZE DISTRIBUTIONS'
    END as status
FROM order_batch_assignments oba
JOIN orders o ON o.id = oba.order_id
JOIN batches b ON b.id = oba.batch_id
LEFT JOIN order_batch_size_distributions obsd ON obsd.order_batch_assignment_id = oba.id
GROUP BY oba.id, o.order_number, b.batch_name, oba.total_quantity
ORDER BY size_distribution_count ASC;

-- Step 4: Create missing size distributions for assignments that don't have them
-- This is a common issue where assignments exist but size distributions are missing
INSERT INTO order_batch_size_distributions (
    order_batch_assignment_id,
    size_name,
    quantity,
    picked_quantity,
    rejected_quantity,
    status,
    created_at,
    updated_at
)
SELECT 
    oba.id,
    'M',  -- Default size
    oba.total_quantity,
    0,    -- No picks yet
    0,    -- No rejections yet
    'pending',
    NOW(),
    NOW()
FROM order_batch_assignments oba
WHERE NOT EXISTS (
    SELECT 1 FROM order_batch_size_distributions obsd 
    WHERE obsd.order_batch_assignment_id = oba.id
)
AND oba.total_quantity > 0;

-- Step 5: Update the view to handle cases where picked_quantity might be NULL
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

-- Step 6: Ensure RLS policies are in place
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

-- Step 7: Update existing records with correct total_quantity
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

-- Step 8: Verify the fix
SELECT 
    'Fix Verification' as check_type,
    assignment_id,
    order_id,
    batch_name,
    total_quantity,
    total_picked_quantity,
    total_rejected_quantity,
    batch_leader_name,
    batch_leader_avatar_url,
    batch_leader_avatar,
    CASE 
        WHEN total_picked_quantity > 0 THEN 'HAS PICKS - QC PAGE SHOULD SHOW'
        ELSE 'NO PICKS YET - NEED TO PICK FIRST'
    END as qc_status
FROM order_batch_assignments_with_details
WHERE total_quantity > 0
ORDER BY total_picked_quantity DESC, assignment_id;

-- Step 9: Create some test picked quantities for demonstration
-- Uncomment the following lines to create test data
/*
UPDATE order_batch_size_distributions 
SET picked_quantity = 5, status = 'picked'
WHERE order_batch_assignment_id IN (
    SELECT id FROM order_batch_assignments 
    WHERE total_quantity > 0 
    LIMIT 1
);
*/

-- Success message
SELECT 'QC page fix applied! Check the verification results above.' as result;
