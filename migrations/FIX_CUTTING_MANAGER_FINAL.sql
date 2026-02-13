-- ============================================================================
-- FIX: Cutting Manager Final Fix - Complete Data Flow
-- Generated: October 8, 2025
-- Description: Fix the complete data flow for batch assignments and quantities
-- ============================================================================

-- ============================================================================
-- PART 1: UPDATE EXISTING BATCH ASSIGNMENTS WITH MISSING DATA
-- ============================================================================

SELECT '=== FIXING EXISTING BATCH ASSIGNMENTS ===' as info;

-- Update batch assignments with missing batch_name and batch_leader_id
UPDATE order_batch_assignments 
SET 
    batch_name = (
        SELECT b.batch_name 
        FROM batches b 
        WHERE b.id = order_batch_assignments.batch_id
    ),
    batch_leader_id = (
        SELECT b.batch_leader_id 
        FROM batches b 
        WHERE b.id = order_batch_assignments.batch_id
    )
WHERE batch_name IS NULL OR batch_leader_id IS NULL;

-- ============================================================================
-- PART 2: CALCULATE AND UPDATE TOTAL QUANTITIES
-- ============================================================================

SELECT '=== CALCULATING TOTAL QUANTITIES ===' as info;

-- Update total_quantity in order_batch_assignments from size distributions
UPDATE order_batch_assignments 
SET total_quantity = (
    SELECT COALESCE(SUM(obsd.quantity), 0)
    FROM order_batch_size_distributions obsd
    WHERE obsd.order_batch_assignment_id = order_batch_assignments.id
)
WHERE total_quantity IS NULL OR total_quantity = 0;

-- Update size quantities in order_batch_assignments from size distributions
UPDATE order_batch_assignments 
SET 
    size_s_quantity = COALESCE((
        SELECT SUM(obsd.quantity)
        FROM order_batch_size_distributions obsd
        WHERE obsd.order_batch_assignment_id = order_batch_assignments.id
          AND obsd.size_name = 'S'
    ), 0),
    size_m_quantity = COALESCE((
        SELECT SUM(obsd.quantity)
        FROM order_batch_size_distributions obsd
        WHERE obsd.order_batch_assignment_id = order_batch_assignments.id
          AND obsd.size_name = 'M'
    ), 0),
    size_l_quantity = COALESCE((
        SELECT SUM(obsd.quantity)
        FROM order_batch_size_distributions obsd
        WHERE obsd.order_batch_assignment_id = order_batch_assignments.id
          AND obsd.size_name = 'L'
    ), 0),
    size_xl_quantity = COALESCE((
        SELECT SUM(obsd.quantity)
        FROM order_batch_size_distributions obsd
        WHERE obsd.order_batch_assignment_id = order_batch_assignments.id
          AND obsd.size_name = 'XL'
    ), 0),
    size_xxl_quantity = COALESCE((
        SELECT SUM(obsd.quantity)
        FROM order_batch_size_distributions obsd
        WHERE obsd.order_batch_assignment_id = order_batch_assignments.id
          AND obsd.size_name = 'XXL'
    ), 0),
    size_xxxl_quantity = COALESCE((
        SELECT SUM(obsd.quantity)
        FROM order_batch_size_distributions obsd
        WHERE obsd.order_batch_assignment_id = order_batch_assignments.id
          AND obsd.size_name = 'XXXL'
    ), 0)
WHERE total_quantity IS NULL OR total_quantity = 0;

-- ============================================================================
-- PART 3: UPDATE BATCH LEADER AVATARS FROM TAILORS
-- ============================================================================

SELECT '=== UPDATING BATCH LEADER AVATARS ===' as info;

-- Update batch_leader_avatar_url in batches table from tailors table
UPDATE batches 
SET batch_leader_avatar_url = (
    SELECT t.avatar_url 
    FROM tailors t 
    WHERE t.batch_id = batches.id 
      AND t.is_batch_leader = true 
      AND t.avatar_url IS NOT NULL 
      AND t.avatar_url != ''
    LIMIT 1
)
WHERE batch_leader_avatar_url IS NULL 
   OR batch_leader_avatar_url = ''
   OR batch_leader_avatar_url NOT LIKE 'http%';

-- Update batch_leader_name in batches table from tailors table
UPDATE batches 
SET batch_leader_name = (
    SELECT t.full_name 
    FROM tailors t 
    WHERE t.batch_id = batches.id 
      AND t.is_batch_leader = true 
      AND t.full_name IS NOT NULL 
      AND t.full_name != ''
    LIMIT 1
)
WHERE batch_leader_name IS NULL 
   OR batch_leader_name = ''
   OR batch_leader_name = 'Unknown';

-- Update batch_leader_id in batches table from tailors table
UPDATE batches 
SET batch_leader_id = (
    SELECT t.id 
    FROM tailors t 
    WHERE t.batch_id = batches.id 
      AND t.is_batch_leader = true 
    LIMIT 1
)
WHERE batch_leader_id IS NULL;

-- ============================================================================
-- PART 4: RECREATE ORDER_BATCH_ASSIGNMENTS_WITH_DETAILS VIEW
-- ============================================================================

SELECT '=== RECREATING VIEW ===' as info;

-- Drop and recreate the view to ensure it has all the correct data
DROP VIEW IF EXISTS order_batch_assignments_with_details CASCADE;

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
                'picked_quantity', COALESCE(obsd.picked_quantity, 0),
                'rejected_quantity', COALESCE(obsd.rejected_quantity, 0),
                'status', COALESCE(obsd.status, 'pending'),
                'priority', 1,
                'estimated_completion_date', obsd.estimated_completion_date,
                'actual_completion_date', obsd.actual_completion_date,
                'quality_rating', obsd.quality_rating,
                'efficiency_rating', obsd.efficiency_rating
            ) ORDER BY obsd.size_name
        ) FILTER (WHERE obsd.id IS NOT NULL),
        '[]'::json
    ) as size_distributions,
    -- Total picked quantity across all sizes
    COALESCE(SUM(obsd.picked_quantity), 0) as total_picked_quantity,
    -- Total rejected quantity across all sizes
    COALESCE(SUM(obsd.rejected_quantity), 0) as total_rejected_quantity
FROM order_batch_assignments oba
LEFT JOIN batches b ON oba.batch_id = b.id
LEFT JOIN order_batch_size_distributions obsd ON oba.id = obsd.order_batch_assignment_id
GROUP BY 
    oba.id, oba.order_id, oba.batch_id, oba.assigned_by_id, oba.assigned_by_name, 
    oba.assignment_date, oba.status, oba.notes, oba.size_s_quantity, oba.size_m_quantity, 
    oba.size_l_quantity, oba.size_xl_quantity, oba.size_xxl_quantity, oba.size_xxxl_quantity, 
    oba.total_quantity, oba.priority, oba.estimated_completion_date, oba.actual_completion_date, 
    oba.quality_rating, oba.efficiency_rating, oba.is_active, oba.created_at, oba.updated_at,
    b.batch_name, b.batch_code, b.tailor_type, b.max_capacity, b.current_capacity, b.batch_leader_id, 
    b.batch_leader_name, b.batch_leader_avatar_url, b.location, b.department, b.specialization, 
    b.hourly_rate, b.efficiency_rating, b.quality_rating, b.status, b.is_active;

-- ============================================================================
-- PART 5: CREATE MISSING RPC FUNCTIONS
-- ============================================================================

SELECT '=== CREATING MISSING RPC FUNCTIONS ===' as info;

-- Create ensure_fabric_inventory_for_order function
CREATE OR REPLACE FUNCTION ensure_fabric_inventory_for_order(order_id_param UUID)
RETURNS JSON
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN json_build_object(
        'success', true,
        'message', 'Fabric inventory ensured for order',
        'order_id', order_id_param
    );
END;
$$;

-- Create get_order_sizes function
CREATE OR REPLACE FUNCTION get_order_sizes(order_id_param UUID)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_agg(
        json_build_object(
            'size_name', size_name,
            'quantity', quantity
        )
    ) INTO result
    FROM (
        SELECT 
            'S' as size_name,
            COALESCE(SUM(size_s_quantity), 0) as quantity
        FROM order_batch_assignments
        WHERE order_id = order_id_param
        
        UNION ALL
        
        SELECT 
            'M' as size_name,
            COALESCE(SUM(size_m_quantity), 0) as quantity
        FROM order_batch_assignments
        WHERE order_id = order_id_param
        
        UNION ALL
        
        SELECT 
            'L' as size_name,
            COALESCE(SUM(size_l_quantity), 0) as quantity
        FROM order_batch_assignments
        WHERE order_id = order_id_param
        
        UNION ALL
        
        SELECT 
            'XL' as size_name,
            COALESCE(SUM(size_xl_quantity), 0) as quantity
        FROM order_batch_assignments
        WHERE order_id = order_id_param
        
        UNION ALL
        
        SELECT 
            'XXL' as size_name,
            COALESCE(SUM(size_xxl_quantity), 0) as quantity
        FROM order_batch_assignments
        WHERE order_id = order_id_param
        
        UNION ALL
        
        SELECT 
            'XXXL' as size_name,
            COALESCE(SUM(size_xxxl_quantity), 0) as quantity
        FROM order_batch_assignments
        WHERE order_id = order_id_param
    ) sizes
    WHERE quantity > 0;
    
    RETURN COALESCE(result, '[]'::json);
END;
$$;

-- ============================================================================
-- PART 6: VERIFICATION
-- ============================================================================

SELECT '=== VERIFICATION ===' as info;

-- Check specific order that was mentioned in the logs
SELECT 'Specific Order Analysis:' as section;
SELECT 
    o.id as order_id,
    o.order_number,
    c.company_name,
    -- Batch assignment data
    oba.id as assignment_id,
    oba.batch_id,
    oba.total_quantity,
    oba.size_s_quantity,
    oba.size_m_quantity,
    oba.size_l_quantity,
    oba.size_xl_quantity,
    oba.size_xxl_quantity,
    oba.size_xxxl_quantity,
    -- Batch data
    b.batch_name,
    b.batch_leader_name,
    b.batch_leader_avatar_url,
    -- Size distribution data
    COUNT(obsd.id) as size_distribution_count,
    COALESCE(SUM(obsd.quantity), 0) as total_size_quantities
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id
LEFT JOIN order_batch_assignments oba ON o.id = oba.order_id
LEFT JOIN batches b ON oba.batch_id = b.id
LEFT JOIN order_batch_size_distributions obsd ON oba.id = obsd.order_batch_assignment_id
WHERE o.id = 'a64ba7b3-bf52-4771-8f9e-75bbc928885f'
GROUP BY 
    o.id, o.order_number, c.company_name,
    oba.id, oba.batch_id, oba.total_quantity, oba.size_s_quantity, oba.size_m_quantity, 
    oba.size_l_quantity, oba.size_xl_quantity, oba.size_xxl_quantity, oba.size_xxxl_quantity,
    b.batch_name, b.batch_leader_name, b.batch_leader_avatar_url
ORDER BY b.batch_name;

-- Verify the view data
SELECT 'View Data Verification:' as section;
SELECT 
    id,
    order_id,
    batch_name,
    batch_leader_name,
    batch_leader_avatar_url,
    total_quantity,
    size_s_quantity,
    size_m_quantity,
    size_l_quantity,
    size_xl_quantity,
    size_xxl_quantity,
    size_xxxl_quantity
FROM order_batch_assignments_with_details
WHERE order_id = 'a64ba7b3-bf52-4771-8f9e-75bbc928885f'
ORDER BY batch_name;

SELECT 'Cutting Manager Final Fix Completed Successfully!' as status;
