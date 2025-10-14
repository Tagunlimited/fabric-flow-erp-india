-- ============================================================================
-- FIX: Complete Fix for Picker View
-- Generated: October 8, 2025
-- Description: Complete fix for order_batch_assignments_with_details view for Picker page
-- ============================================================================

-- ============================================================================
-- PART 1: DROP AND RECREATE THE VIEW
-- ============================================================================

-- Drop the existing view completely
DROP VIEW IF EXISTS order_batch_assignments_with_details CASCADE;

-- ============================================================================
-- PART 2: CREATE THE CORRECTED VIEW
-- ============================================================================

CREATE VIEW order_batch_assignments_with_details AS
SELECT 
    oba.id,
    oba.id as assignment_id,  -- Alias for assignment_id
    oba.order_id,
    oba.batch_id,
    oba.assigned_by_id,
    oba.assigned_by_name,
    oba.assignment_date,
    oba.status,
    oba.notes,
    oba.size_s_quantity,
    oba.size_m_quantity,
    oba.size_l_quantity,
    oba.size_xl_quantity,
    oba.size_xxl_quantity,
    oba.size_xxxl_quantity,
    oba.total_quantity,
    oba.priority,
    oba.estimated_completion_date,
    oba.actual_completion_date,
    oba.quality_rating,
    oba.efficiency_rating,
    oba.is_active,
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
    b.hourly_rate as batch_hourly_rate,
    b.efficiency_rating as batch_efficiency_rating,
    b.quality_rating as batch_quality_rating,
    b.status as batch_status,
    b.is_active as batch_is_active,
    -- Size distributions (aggregated)
    COALESCE(
        json_agg(
            json_build_object(
                'size_name', obsd.size_name,
                'quantity', obsd.quantity,
                'status', obsd.status,
                'priority', obsd.priority,
                'estimated_completion_date', obsd.estimated_completion_date,
                'actual_completion_date', obsd.actual_completion_date,
                'quality_rating', obsd.quality_rating,
                'efficiency_rating', obsd.efficiency_rating
            )
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
    oba.size_s_quantity,
    oba.size_m_quantity,
    oba.size_l_quantity,
    oba.size_xl_quantity,
    oba.size_xxl_quantity,
    oba.size_xxxl_quantity,
    oba.total_quantity,
    oba.priority,
    oba.estimated_completion_date,
    oba.actual_completion_date,
    oba.quality_rating,
    oba.efficiency_rating,
    oba.is_active,
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
    b.efficiency_rating,
    b.quality_rating,
    b.status,
    b.is_active;

-- ============================================================================
-- PART 3: GRANT PERMISSIONS
-- ============================================================================

GRANT ALL ON order_batch_assignments_with_details TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 4: UPDATE QUANTITIES TO ENSURE DATA IS AVAILABLE
-- ============================================================================

-- Update total_quantity in order_batch_assignments by summing up size distributions
UPDATE order_batch_assignments 
SET total_quantity = (
    SELECT COALESCE(SUM(quantity), 0)
    FROM order_batch_size_distributions 
    WHERE order_batch_assignment_id = order_batch_assignments.id
)
WHERE batch_id IN (
    SELECT id FROM batches WHERE batch_name IN ('AVINASH', 'NAVEENA')
);

-- ============================================================================
-- PART 5: VERIFICATION
-- ============================================================================

SELECT 'Picker view fixed successfully!' as status;

-- Test the view with the exact query the Picker is using
SELECT 'Testing Picker query:' as info;
SELECT 
    assignment_id,
    batch_id,
    order_id,
    total_quantity
FROM order_batch_assignments_with_details 
WHERE batch_id IN ('356cc5b3-90ff-4ff2-b647-e6311258b5b2', '7a8041df-3914-4056-a513-d3986364dc10');

-- Show all data from the view
SELECT 'All view data:' as info;
SELECT 
    id,
    assignment_id,
    batch_id,
    order_id,
    total_quantity,
    batch_name,
    batch_leader_name,
    status
FROM order_batch_assignments_with_details 
WHERE batch_id IN ('356cc5b3-90ff-4ff2-b647-e6311258b5b2', '7a8041df-3914-4056-a513-d3986364dc10')
ORDER BY batch_name;
