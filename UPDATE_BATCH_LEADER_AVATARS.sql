-- ============================================================================
-- UPDATE: Batch Leader Avatars
-- Generated: October 8, 2025
-- Description: Updates batch leader avatar URLs to use actual tailor avatars
-- ============================================================================

-- ============================================================================
-- PART 1: UPDATE BATCH LEADER AVATARS FROM ACTUAL TAILOR AVATARS
-- ============================================================================

-- Update batch leader avatar URLs by linking to actual tailor avatars
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
  AND (batch_leader_avatar_url IS NULL OR batch_leader_avatar_url = '');

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
  AND (batch_leader_avatar_url IS NULL OR batch_leader_avatar_url = '');

-- ============================================================================
-- PART 2: UPDATE BATCH LEADER NAMES IF MISSING
-- ============================================================================

-- Update batch leader names for existing batches
UPDATE batches 
SET batch_leader_name = 'Priya Sharma'
WHERE batch_name = 'AVINASH' AND (batch_leader_name IS NULL OR batch_leader_name = '');

UPDATE batches 
SET batch_leader_name = 'NAEEMA SHAIKH'
WHERE batch_name = 'NAVEENA' AND (batch_leader_name IS NULL OR batch_leader_name = '');

-- ============================================================================
-- PART 3: VERIFICATION
-- ============================================================================

SELECT 'Batch leader avatars updated successfully!' as status;

-- Show updated batch data
SELECT 'Updated batch data with avatars:' as info;
SELECT 
    id,
    batch_name,
    batch_code,
    batch_leader_name,
    batch_leader_avatar_url,
    max_capacity,
    current_capacity,
    status
FROM batches 
WHERE batch_name IN ('AVINASH', 'NAVEENA')
ORDER BY batch_name;
