-- ============================================================================
-- FIX: Batch Avatar Complete Fix
-- Generated: October 8, 2025
-- Description: Complete fix for batch leader avatars using actual tailor avatars
-- ============================================================================

-- ============================================================================
-- PART 1: CLEAR EXISTING BATCH LEADER AVATAR DATA
-- ============================================================================

-- Clear existing batch leader avatar URLs to start fresh
UPDATE batches 
SET batch_leader_avatar_url = NULL
WHERE batch_name IN ('AVINASH', 'NAVEENA');

-- ============================================================================
-- PART 2: UPDATE BATCH LEADER AVATARS FROM TAILOR DATA
-- ============================================================================

-- Update AVINASH batch leader avatar (Priya Sharma)
UPDATE batches 
SET batch_leader_avatar_url = (
    SELECT avatar_url 
    FROM tailors 
    WHERE full_name = 'Priya Sharma'
      AND batch_id = (
          SELECT id FROM batches WHERE batch_name = 'AVINASH'
      )
    LIMIT 1
)
WHERE batch_name = 'AVINASH' 
  AND batch_leader_name = 'Priya Sharma';

-- Update NAVEENA batch leader avatar (NAEEMA SHAIKH)
UPDATE batches 
SET batch_leader_avatar_url = (
    SELECT avatar_url 
    FROM tailors 
    WHERE full_name = 'NAEEMA SHAIKH'
      AND batch_id = (
          SELECT id FROM batches WHERE batch_name = 'NAVEENA'
      )
    LIMIT 1
)
WHERE batch_name = 'NAVEENA' 
  AND batch_leader_name = 'NAEEMA SHAIKH';

-- ============================================================================
-- PART 3: ALTERNATIVE APPROACH - DIRECT NAME MATCHING
-- ============================================================================

-- If the above doesn't work, try direct name matching without batch_id constraint
UPDATE batches 
SET batch_leader_avatar_url = (
    SELECT avatar_url 
    FROM tailors 
    WHERE full_name = 'Priya Sharma'
      AND is_batch_leader = true
    LIMIT 1
)
WHERE batch_name = 'AVINASH' 
  AND batch_leader_name = 'Priya Sharma'
  AND batch_leader_avatar_url IS NULL;

UPDATE batches 
SET batch_leader_avatar_url = (
    SELECT avatar_url 
    FROM tailors 
    WHERE full_name = 'NAEEMA SHAIKH'
      AND is_batch_leader = true
    LIMIT 1
)
WHERE batch_name = 'NAVEENA' 
  AND batch_leader_name = 'NAEEMA SHAIKH'
  AND batch_leader_avatar_url IS NULL;

-- ============================================================================
-- PART 4: UPDATE BATCH LEADER IDS TO MATCH TAILOR IDS
-- ============================================================================

-- Update batch_leader_id to match the actual tailor IDs
UPDATE batches 
SET batch_leader_id = (
    SELECT id 
    FROM tailors 
    WHERE full_name = 'Priya Sharma'
      AND is_batch_leader = true
    LIMIT 1
)
WHERE batch_name = 'AVINASH' 
  AND batch_leader_name = 'Priya Sharma';

UPDATE batches 
SET batch_leader_id = (
    SELECT id 
    FROM tailors 
    WHERE full_name = 'NAEEMA SHAIKH'
      AND is_batch_leader = true
    LIMIT 1
)
WHERE batch_name = 'NAVEENA' 
  AND batch_leader_name = 'NAEEMA SHAIKH';

-- ============================================================================
-- PART 5: VERIFICATION
-- ============================================================================

SELECT 'Batch avatar fix completed!' as status;

-- Show updated batch data
SELECT 'Updated batch data:' as info;
SELECT 
    id,
    batch_name,
    batch_code,
    batch_leader_id,
    batch_leader_name,
    batch_leader_avatar_url,
    is_active
FROM batches 
WHERE batch_name IN ('AVINASH', 'NAVEENA')
ORDER BY batch_name;

-- Show the corresponding tailor data
SELECT 'Corresponding tailor data:' as info;
SELECT 
    t.id,
    t.full_name,
    t.tailor_code,
    t.avatar_url,
    t.is_batch_leader,
    t.batch_id,
    b.batch_name
FROM tailors t
LEFT JOIN batches b ON t.batch_id = b.id
WHERE t.full_name IN ('Priya Sharma', 'NAEEMA SHAIKH')
ORDER BY t.full_name;

-- Test the view data
SELECT 'View data after fix:' as info;
SELECT 
    id,
    batch_name,
    batch_leader_name,
    batch_leader_avatar_url,
    total_quantity
FROM order_batch_assignments_with_details 
WHERE batch_name IN ('AVINASH', 'NAVEENA')
ORDER BY batch_name;
