-- ============================================================================
-- FIX: Batch Assignment Quantities
-- Generated: October 8, 2025
-- Description: Fix batch assignment quantities to show actual distributed pieces
-- ============================================================================

-- ============================================================================
-- PART 1: DIAGNOSE CURRENT QUANTITY DATA
-- ============================================================================

-- Check current batch assignment quantities
SELECT 'Current batch assignment quantities:' as info;
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
    status
FROM order_batch_assignments 
WHERE batch_id IN (
    SELECT id FROM batches WHERE batch_name IN ('AVINASH', 'NAVEENA')
)
ORDER BY batch_id;

-- Check size distribution quantities
SELECT 'Size distribution quantities:' as info;
SELECT 
    obsd.id,
    obsd.order_batch_assignment_id,
    obsd.size_name,
    obsd.quantity,
    obsd.status,
    oba.batch_id,
    b.batch_name
FROM order_batch_size_distributions obsd
JOIN order_batch_assignments oba ON obsd.order_batch_assignment_id = oba.id
JOIN batches b ON oba.batch_id = b.id
WHERE b.batch_name IN ('AVINASH', 'NAVEENA')
ORDER BY b.batch_name, obsd.size_name;

-- ============================================================================
-- PART 2: UPDATE TOTAL QUANTITIES FROM SIZE DISTRIBUTIONS
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
-- PART 3: UPDATE SIZE QUANTITIES IN ORDER_BATCH_ASSIGNMENTS
-- ============================================================================

-- Update size quantities in order_batch_assignments from size distributions
UPDATE order_batch_assignments 
SET 
    size_s_quantity = (
        SELECT COALESCE(SUM(quantity), 0)
        FROM order_batch_size_distributions 
        WHERE order_batch_assignment_id = order_batch_assignments.id 
          AND size_name = 'S'
    ),
    size_m_quantity = (
        SELECT COALESCE(SUM(quantity), 0)
        FROM order_batch_size_distributions 
        WHERE order_batch_assignment_id = order_batch_assignments.id 
          AND size_name = 'M'
    ),
    size_l_quantity = (
        SELECT COALESCE(SUM(quantity), 0)
        FROM order_batch_size_distributions 
        WHERE order_batch_assignment_id = order_batch_assignments.id 
          AND size_name = 'L'
    ),
    size_xl_quantity = (
        SELECT COALESCE(SUM(quantity), 0)
        FROM order_batch_size_distributions 
        WHERE order_batch_assignment_id = order_batch_assignments.id 
          AND size_name = 'XL'
    ),
    size_xxl_quantity = (
        SELECT COALESCE(SUM(quantity), 0)
        FROM order_batch_size_distributions 
        WHERE order_batch_assignment_id = order_batch_assignments.id 
          AND size_name = 'XXL'
    ),
    size_xxxl_quantity = (
        SELECT COALESCE(SUM(quantity), 0)
        FROM order_batch_size_distributions 
        WHERE order_batch_assignment_id = order_batch_assignments.id 
          AND size_name = 'XXXL'
    )
WHERE batch_id IN (
    SELECT id FROM batches WHERE batch_name IN ('AVINASH', 'NAVEENA')
);

-- ============================================================================
-- PART 4: UPDATE BATCH CURRENT CAPACITY
-- ============================================================================

-- Update batch current_capacity to reflect assigned quantities
UPDATE batches 
SET current_capacity = (
    SELECT COALESCE(SUM(total_quantity), 0)
    FROM order_batch_assignments 
    WHERE batch_id = batches.id
)
WHERE batch_name IN ('AVINASH', 'NAVEENA');

-- ============================================================================
-- PART 5: VERIFICATION
-- ============================================================================

SELECT 'Batch quantities fixed successfully!' as status;

-- Show updated batch assignment quantities
SELECT 'Updated batch assignment quantities:' as info;
SELECT 
    oba.id,
    b.batch_name,
    oba.total_quantity,
    oba.size_s_quantity,
    oba.size_m_quantity,
    oba.size_l_quantity,
    oba.status
FROM order_batch_assignments oba
JOIN batches b ON oba.batch_id = b.id
WHERE b.batch_name IN ('AVINASH', 'NAVEENA')
ORDER BY b.batch_name;

-- Show batch capacity updates
SELECT 'Updated batch capacities:' as info;
SELECT 
    batch_name,
    batch_code,
    max_capacity,
    current_capacity,
    (current_capacity::float / max_capacity::float * 100) as capacity_percentage
FROM batches 
WHERE batch_name IN ('AVINASH', 'NAVEENA')
ORDER BY batch_name;

-- Show view data with quantities
SELECT 'View data with quantities:' as info;
SELECT 
    id,
    batch_name,
    batch_leader_name,
    total_quantity,
    size_s_quantity,
    size_m_quantity,
    size_l_quantity,
    status
FROM order_batch_assignments_with_details 
WHERE batch_name IN ('AVINASH', 'NAVEENA')
ORDER BY batch_name;
