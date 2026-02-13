-- Test QC Page Fix
-- Run this in Supabase Dashboard SQL Editor to verify the view works correctly

-- Test 1: Check if the view has both column names
SELECT 
    'Column Check' as test_name,
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_name = 'order_batch_assignments_with_details' 
  AND column_name IN ('batch_leader_avatar_url', 'batch_leader_avatar')
ORDER BY column_name;

-- Test 2: Check if QC page query works
SELECT 
    'QC Page Query Test' as test_name,
    assignment_id, 
    order_id, 
    total_quantity, 
    batch_name, 
    batch_leader_name, 
    batch_leader_avatar_url,
    batch_leader_avatar  -- This should work now
FROM order_batch_assignments_with_details
WHERE total_quantity > 0
LIMIT 5;

-- Test 3: Verify both columns have same values
SELECT 
    'Column Values Check' as test_name,
    assignment_id,
    batch_leader_avatar_url,
    batch_leader_avatar,
    CASE 
        WHEN batch_leader_avatar_url = batch_leader_avatar THEN 'PASS - VALUES MATCH'
        ELSE 'FAIL - VALUES DIFFER'
    END as status
FROM order_batch_assignments_with_details
WHERE batch_leader_avatar_url IS NOT NULL
LIMIT 5;

-- Success message
SELECT 'QC page fix verification completed!' as result;
