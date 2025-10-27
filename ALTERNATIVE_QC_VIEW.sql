-- ALTERNATIVE QC PAGE LOGIC FIX
-- This creates a modified view that shows ALL assigned orders, not just picked ones
-- This helps debug the QC page issue

-- Create an alternative view that shows all assignments (including unpicked ones)
CREATE OR REPLACE VIEW order_batch_assignments_with_details_all AS
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
    -- Add a flag to indicate if this assignment has been picked
    CASE 
        WHEN COALESCE(SUM(COALESCE(obsd.picked_quantity, 0)), 0) > 0 THEN true
        ELSE false
    END as has_been_picked,
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

-- Test the alternative view
SELECT 
    'Alternative View Test - All Assignments' as check_type,
    assignment_id,
    order_id,
    batch_name,
    total_quantity,
    total_picked_quantity,
    has_been_picked,
    batch_leader_name,
    batch_leader_avatar,
    CASE 
        WHEN has_been_picked THEN 'READY FOR QC'
        ELSE 'NEEDS PICKING FIRST'
    END as status
FROM order_batch_assignments_with_details_all
WHERE total_quantity > 0
ORDER BY has_been_picked DESC, assignment_id;

-- Show the difference between the two views
SELECT 
    'View Comparison' as check_type,
    'Original view shows only picked orders' as original_view,
    'Alternative view shows all orders' as alternative_view,
    'QC page should use alternative view to show all assigned orders' as recommendation;
