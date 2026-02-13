-- Fix Cutting Master Batch Quantity and Picker Visibility
-- This script addresses two critical issues:
-- 1. Cutting Manager showing 0 quantity for assigned batches
-- 2. Picker interface not showing assigned orders to tailors

-- Step 1: Update order_batch_assignments_with_details View
-- This view needs to properly calculate total_quantity by summing from order_batch_size_distributions

CREATE OR REPLACE VIEW order_batch_assignments_with_details AS
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

-- Step 2: Verify and Fix RLS Policies for Picker Access
-- Ensure that the tables have proper RLS policies allowing tailors to view their assignments

-- Check existing policies (for reference)
-- SELECT * FROM pg_policies 
-- WHERE tablename IN ('order_batch_assignments', 'batches', 'order_batch_size_distributions');

-- Ensure order_batch_assignments has proper SELECT policy
CREATE POLICY IF NOT EXISTS "Allow users to view batch assignments"
ON order_batch_assignments FOR SELECT
USING (true);

-- Ensure batches table has proper SELECT policy  
CREATE POLICY IF NOT EXISTS "Allow users to view batches"
ON batches FOR SELECT
USING (true);

-- Ensure order_batch_size_distributions has proper SELECT policy
CREATE POLICY IF NOT EXISTS "Allow users to view size distributions"
ON order_batch_size_distributions FOR SELECT
USING (true);

-- Step 3: Test Data Integrity
-- Check if batch assignments have proper size distributions
-- This query will help identify any data inconsistencies

-- SELECT 
--     oba.id as assignment_id,
--     o.order_number,
--     b.batch_name,
--     oba.total_quantity as stored_total,
--     COALESCE(SUM(obsd.quantity), 0) as calculated_total,
--     COUNT(obsd.id) as size_count
-- FROM order_batch_assignments oba
-- JOIN orders o ON o.id = oba.order_id
-- JOIN batches b ON b.id = oba.batch_id
-- LEFT JOIN order_batch_size_distributions obsd ON obsd.order_batch_assignment_id = oba.id
-- GROUP BY oba.id, o.order_number, b.batch_name, oba.total_quantity
-- ORDER BY o.order_number;

-- Step 4: Update total_quantity in Existing Records (if needed)
-- If existing records have incorrect total_quantity, update them

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

-- Step 5: Verify the fix
-- Check that the view now returns correct quantities

SELECT 
    assignment_id,
    order_id,
    batch_name,
    total_quantity,
    total_picked_quantity,
    total_rejected_quantity,
    json_array_length(size_distributions) as size_count
FROM order_batch_assignments_with_details
WHERE total_quantity > 0
ORDER BY assignment_id;

-- Success message
SELECT 'Batch quantity and picker visibility fixes applied successfully!' as status;
