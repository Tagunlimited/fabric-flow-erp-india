-- Test script to verify batch quantity and picker visibility fixes
-- This script checks data integrity and verifies the fixes are working

-- Test 1: Check if batch assignments have proper size distributions
SELECT 
    'Data Integrity Check' as test_name,
    oba.id as assignment_id,
    o.order_number,
    b.batch_name,
    oba.total_quantity as stored_total,
    COALESCE(SUM(obsd.quantity), 0) as calculated_total,
    COUNT(obsd.id) as size_count,
    CASE 
        WHEN oba.total_quantity = COALESCE(SUM(obsd.quantity), 0) THEN 'PASS'
        ELSE 'FAIL - MISMATCH'
    END as status
FROM order_batch_assignments oba
JOIN orders o ON o.id = oba.order_id
JOIN batches b ON b.id = oba.batch_id
LEFT JOIN order_batch_size_distributions obsd ON obsd.order_batch_assignment_id = oba.id
GROUP BY oba.id, o.order_number, b.batch_name, oba.total_quantity
ORDER BY o.order_number;

-- Test 2: Verify the view returns correct quantities
SELECT 
    'View Test' as test_name,
    assignment_id,
    order_id,
    batch_name,
    total_quantity,
    total_picked_quantity,
    total_rejected_quantity,
    json_array_length(size_distributions) as size_count,
    CASE 
        WHEN total_quantity > 0 THEN 'PASS - HAS QUANTITY'
        ELSE 'FAIL - ZERO QUANTITY'
    END as status
FROM order_batch_assignments_with_details
WHERE total_quantity > 0
ORDER BY assignment_id;

-- Test 3: Check RLS policies are in place
SELECT 
    'RLS Policy Check' as test_name,
    tablename,
    policyname,
    cmd,
    CASE 
        WHEN cmd = 'SELECT' THEN 'PASS - SELECT POLICY EXISTS'
        ELSE 'INFO - OTHER POLICY'
    END as status
FROM pg_policies 
WHERE tablename IN ('order_batch_assignments', 'batches', 'order_batch_size_distributions')
ORDER BY tablename, policyname;

-- Test 4: Check for any assignments with zero quantities that should have quantities
SELECT 
    'Zero Quantity Check' as test_name,
    oba.id as assignment_id,
    o.order_number,
    b.batch_name,
    oba.total_quantity,
    COUNT(obsd.id) as size_distribution_count,
    CASE 
        WHEN COUNT(obsd.id) > 0 AND oba.total_quantity = 0 THEN 'FAIL - HAS SIZE DISTRIBUTIONS BUT ZERO TOTAL'
        WHEN COUNT(obsd.id) = 0 AND oba.total_quantity = 0 THEN 'PASS - NO SIZE DISTRIBUTIONS'
        WHEN oba.total_quantity > 0 THEN 'PASS - HAS QUANTITY'
        ELSE 'UNKNOWN'
    END as status
FROM order_batch_assignments oba
JOIN orders o ON o.id = oba.order_id
JOIN batches b ON b.id = oba.batch_id
LEFT JOIN order_batch_size_distributions obsd ON obsd.order_batch_assignment_id = oba.id
GROUP BY oba.id, o.order_number, b.batch_name, oba.total_quantity
ORDER BY oba.total_quantity DESC;

-- Summary
SELECT 'All tests completed. Check results above for any FAIL status.' as summary;
