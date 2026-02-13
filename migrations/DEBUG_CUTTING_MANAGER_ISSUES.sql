-- ============================================================================
-- DEBUG: Cutting Manager Issues - Batch Images and Quantities
-- Generated: October 8, 2025
-- Description: Debug batch images not showing and quantities showing 0
-- ============================================================================

-- ============================================================================
-- PART 1: CHECK CURRENT BATCH ASSIGNMENTS DATA
-- ============================================================================

SELECT '=== DEBUGGING CUTTING MANAGER ISSUES ===' as info;

-- Check order_batch_assignments_with_details view data
SELECT 'Order Batch Assignments With Details:' as section;
SELECT 
    id,
    assignment_id,
    order_id,
    batch_id,
    batch_name,
    batch_leader_name,
    batch_leader_avatar_url,
    total_quantity,
    size_s_quantity,
    size_m_quantity,
    size_l_quantity,
    size_xl_quantity,
    size_xxl_quantity,
    size_xxxl_quantity,
    status,
    created_at
FROM order_batch_assignments_with_details
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- PART 2: CHECK BATCHES TABLE DATA
-- ============================================================================

SELECT 'Batches Table Data:' as section;
SELECT 
    id,
    batch_name,
    batch_code,
    batch_leader_name,
    batch_leader_avatar_url,
    current_capacity,
    max_capacity,
    status,
    created_at
FROM batches
ORDER BY created_at DESC;

-- ============================================================================
-- PART 3: CHECK ORDER BATCH ASSIGNMENTS DATA
-- ============================================================================

SELECT 'Order Batch Assignments Data:' as section;
SELECT 
    id,
    order_id,
    batch_id,
    total_quantity,
    size_s_quantity,
    size_m_quantity,
    size_l_quantity,
    size_xl_quantity,
    size_xxl_quantity,
    size_xxxl_quantity,
    status,
    assignment_date,
    created_at
FROM order_batch_assignments
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- PART 4: CHECK ORDER BATCH SIZE DISTRIBUTIONS
-- ============================================================================

SELECT 'Order Batch Size Distributions:' as section;
SELECT 
    id,
    order_batch_assignment_id,
    size_name,
    quantity,
    picked_quantity,
    status,
    created_at
FROM order_batch_size_distributions
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- PART 5: CHECK TAILORS DATA FOR AVATARS
-- ============================================================================

SELECT 'Tailors Data (for batch leaders):' as section;
SELECT 
    id,
    full_name,
    avatar_url,
    is_batch_leader,
    batch_id,
    status
FROM tailors
WHERE is_batch_leader = true
ORDER BY created_at DESC;

-- ============================================================================
-- PART 6: CHECK SPECIFIC ISSUES
-- ============================================================================

-- Check for orders with batch assignments but no quantities
SELECT 'Orders with batch assignments but no quantities:' as section;
SELECT 
    oba.order_id,
    oba.total_quantity,
    oba.size_s_quantity,
    oba.size_m_quantity,
    oba.size_l_quantity,
    oba.size_xl_quantity,
    oba.size_xxl_quantity,
    oba.size_xxxl_quantity,
    b.batch_name,
    b.batch_leader_name,
    b.batch_leader_avatar_url
FROM order_batch_assignments oba
LEFT JOIN batches b ON oba.batch_id = b.id
WHERE oba.total_quantity IS NULL OR oba.total_quantity = 0
ORDER BY oba.created_at DESC;

-- Check for batch leaders without avatars
SELECT 'Batch leaders without avatars:' as section;
SELECT 
    b.id,
    b.batch_name,
    b.batch_leader_name,
    b.batch_leader_avatar_url,
    t.full_name,
    t.avatar_url
FROM batches b
LEFT JOIN tailors t ON b.batch_leader_id = t.id
WHERE b.batch_leader_avatar_url IS NULL OR b.batch_leader_avatar_url = ''
ORDER BY b.created_at DESC;

-- ============================================================================
-- PART 7: CHECK VIEW DEFINITION
-- ============================================================================

SELECT 'View Definition Check:' as section;
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'order_batch_assignments_with_details'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================================================
-- PART 8: SAMPLE DATA ANALYSIS
-- ============================================================================

-- Analyze specific order that's showing 0 quantities
SELECT 'Sample Order Analysis:' as section;
SELECT 
    o.id as order_id,
    o.order_number,
    c.company_name,
    -- Batch assignment data
    oba.id as assignment_id,
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
WHERE o.order_number IN ('UC/25-6/OCT/003', 'UC/25-6/OCT/004', 'UC/25-6/OCT/008')
GROUP BY 
    o.id, o.order_number, c.company_name,
    oba.id, oba.total_quantity, oba.size_s_quantity, oba.size_m_quantity, 
    oba.size_l_quantity, oba.size_xl_quantity, oba.size_xxl_quantity, oba.size_xxxl_quantity,
    b.batch_name, b.batch_leader_name, b.batch_leader_avatar_url
ORDER BY o.order_number, b.batch_name;

SELECT 'Cutting Manager Debug Completed!' as status;
