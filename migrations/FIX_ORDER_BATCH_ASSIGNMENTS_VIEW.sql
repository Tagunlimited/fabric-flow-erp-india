-- ============================================================================
-- FIX: Create order_batch_assignments_with_details View
-- Generated: October 8, 2025
-- Description: Creates the missing view that joins order_batch_assignments with batches and size distributions
-- ============================================================================

-- ============================================================================
-- PART 1: DIAGNOSE THE CURRENT STATE
-- ============================================================================

-- Check if the view already exists
SELECT 'Checking if order_batch_assignments_with_details view exists:' as info;
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.views 
            WHERE table_name = 'order_batch_assignments_with_details' 
              AND table_schema = 'public'
        ) 
        THEN '✅ order_batch_assignments_with_details view exists'
        ELSE '❌ order_batch_assignments_with_details view missing'
    END as view_check;

-- ============================================================================
-- PART 2: DROP EXISTING VIEW IF IT EXISTS
-- ============================================================================

DROP VIEW IF EXISTS order_batch_assignments_with_details CASCADE;

-- ============================================================================
-- PART 3: CREATE THE COMPREHENSIVE VIEW
-- ============================================================================

CREATE VIEW order_batch_assignments_with_details AS
SELECT 
    oba.id,
    oba.id as assignment_id,  -- Add alias for assignment_id
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
-- PART 4: GRANT PERMISSIONS ON THE VIEW
-- ============================================================================

GRANT ALL ON order_batch_assignments_with_details TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 5: VERIFICATION
-- ============================================================================

SELECT 'Order batch assignments with details view created successfully!' as status;

-- Test the view exists
SELECT 'Verification of the view:' as info;
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.views 
            WHERE table_name = 'order_batch_assignments_with_details' 
              AND table_schema = 'public'
        ) 
        THEN '✅ order_batch_assignments_with_details view exists'
        ELSE '❌ order_batch_assignments_with_details view missing'
    END as view_verification;

-- Show the view structure
SELECT 'View structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'order_batch_assignments_with_details' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Test query to show sample data
SELECT 'Sample data from the view:' as info;
SELECT 
    id,
    order_id,
    batch_id,
    batch_name,
    batch_code,
    batch_leader_name,
    total_quantity,
    status,
    size_distributions
FROM order_batch_assignments_with_details 
LIMIT 3;
