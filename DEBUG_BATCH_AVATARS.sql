-- ============================================================================
-- DEBUG: Batch Avatar Data
-- Generated: October 8, 2025
-- Description: Debug script to check batch leader avatar data
-- ============================================================================

-- ============================================================================
-- PART 1: CHECK CURRENT BATCH DATA
-- ============================================================================

SELECT 'Current batch data:' as info;
SELECT 
    id,
    batch_name,
    batch_code,
    batch_leader_name,
    batch_leader_avatar_url,
    batch_leader_id,
    is_active
FROM batches 
WHERE batch_name IN ('AVINASH', 'NAVEENA')
ORDER BY batch_name;

-- ============================================================================
-- PART 2: CHECK TAILOR DATA
-- ============================================================================

SELECT 'Current tailor data:' as info;
SELECT 
    id,
    full_name,
    tailor_code,
    avatar_url,
    is_batch_leader,
    batch_id,
    status
FROM tailors 
WHERE full_name IN ('Priya Sharma', 'NAEEMA SHAIKH', 'PARIDHI MUDGAL')
ORDER BY full_name;

-- ============================================================================
-- PART 3: CHECK VIEW DATA
-- ============================================================================

SELECT 'View data for batch assignments:' as info;
SELECT 
    id,
    batch_name,
    batch_leader_name,
    batch_leader_avatar_url,
    total_quantity,
    status
FROM order_batch_assignments_with_details 
WHERE batch_name IN ('AVINASH', 'NAVEENA')
ORDER BY batch_name;

-- ============================================================================
-- PART 4: CHECK BATCH-TAILOR RELATIONSHIPS
-- ============================================================================

SELECT 'Batch-Tailor relationships:' as info;
SELECT 
    b.batch_name,
    b.batch_leader_name,
    b.batch_leader_avatar_url as batch_avatar,
    t.full_name as tailor_name,
    t.avatar_url as tailor_avatar,
    t.is_batch_leader
FROM batches b
LEFT JOIN tailors t ON t.full_name = b.batch_leader_name
WHERE b.batch_name IN ('AVINASH', 'NAVEENA')
ORDER BY b.batch_name;
