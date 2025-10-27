-- COMPREHENSIVE QC PAGE FIX
-- This script addresses the issue where picked orders are not showing in QC page
-- even after adding batch leader avatars

-- Step 1: Check current state of picked quantities
SELECT 
    'Current Picked Quantities Check' as check_type,
    COUNT(*) as total_size_distributions,
    COUNT(CASE WHEN picked_quantity > 0 THEN 1 END) as with_picked_quantity,
    SUM(picked_quantity) as total_picked,
    COUNT(DISTINCT order_batch_assignment_id) as unique_assignments
FROM order_batch_size_distributions;

-- Step 2: Check if assignments exist but have no picked quantities
SELECT 
    'Assignments Without Picked Quantities' as check_type,
    oba.id as assignment_id,
    o.order_number,
    b.batch_name,
    oba.total_quantity,
    COALESCE(SUM(obsd.picked_quantity), 0) as total_picked,
    CASE 
        WHEN COALESCE(SUM(obsd.picked_quantity), 0) = 0 THEN 'NO PICKS YET'
        ELSE 'HAS PICKS'
    END as status
FROM order_batch_assignments oba
JOIN orders o ON o.id = oba.order_id
JOIN batches b ON b.id = oba.batch_id
LEFT JOIN order_batch_size_distributions obsd ON obsd.order_batch_assignment_id = oba.id
GROUP BY oba.id, o.order_number, b.batch_name, oba.total_quantity
ORDER BY total_picked DESC;

-- Step 3: Check if the view is working correctly
SELECT 
    'View Test - All Assignments' as check_type,
    assignment_id,
    order_id,
    batch_name,
    total_quantity,
    total_picked_quantity,
    batch_leader_name,
    batch_leader_avatar_url,
    batch_leader_avatar
FROM order_batch_assignments_with_details
ORDER BY assignment_id;

-- Step 4: Check QC page query specifically
SELECT 
    'QC Page Query Test' as check_type,
    assignment_id, 
    order_id, 
    total_quantity, 
    batch_name, 
    batch_leader_name, 
    batch_leader_avatar_url,
    batch_leader_avatar
FROM order_batch_assignments_with_details
WHERE total_quantity > 0
ORDER BY assignment_date DESC;

-- Step 5: Check if there are any picked quantities in the system
SELECT 
    'Picked Quantities by Assignment' as check_type,
    order_batch_assignment_id,
    size_name,
    quantity as assigned_quantity,
    picked_quantity,
    CASE 
        WHEN picked_quantity > 0 THEN 'HAS PICKS'
        ELSE 'NO PICKS'
    END as status
FROM order_batch_size_distributions
ORDER BY picked_quantity DESC, order_batch_assignment_id;

-- Step 6: Check notes field for picked quantities (fallback method)
SELECT 
    'Notes Field Check' as check_type,
    id as assignment_id,
    notes,
    CASE 
        WHEN notes LIKE '%picked_by_size%' THEN 'HAS PICKS IN NOTES'
        ELSE 'NO PICKS IN NOTES'
    END as status
FROM order_batch_assignments
WHERE notes IS NOT NULL
ORDER BY id;

-- Step 7: Create test data if needed (uncomment to run)
-- This will create some test picked quantities for demonstration
/*
INSERT INTO order_batch_size_distributions (
    order_batch_assignment_id,
    size_name,
    quantity,
    picked_quantity,
    status
)
SELECT 
    oba.id,
    'M',
    10,
    5,  -- Set some picked quantity
    'picked'
FROM order_batch_assignments oba
JOIN orders o ON o.id = oba.order_id
WHERE o.order_number LIKE '%TUC/25-26/OCT/014%'
LIMIT 1;
*/

-- Step 8: Verify the fix worked
SELECT 
    'Final Verification' as check_type,
    'If you see assignments with picked_quantity > 0 above, QC page should work' as message;
