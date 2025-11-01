-- Quick Test: Check Current Batch Assignment Data
-- Run this in Supabase Dashboard SQL Editor to see current state

-- Test 1: Check if size distributions exist
SELECT 
    'Size Distributions Check' as test_name,
    COUNT(*) as total_records,
    COUNT(DISTINCT order_batch_assignment_id) as unique_assignments,
    SUM(quantity) as total_quantity
FROM order_batch_size_distributions;

-- Test 2: Check batch assignments
SELECT 
    'Batch Assignments Check' as test_name,
    COUNT(*) as total_assignments,
    SUM(total_quantity) as total_stored_quantity
FROM order_batch_assignments;

-- Test 3: Check specific orders mentioned in the image
SELECT 
    'Specific Orders Check' as test_name,
    o.order_number,
    b.batch_name,
    oba.total_quantity as stored_total,
    COALESCE(SUM(obsd.quantity), 0) as calculated_total,
    COUNT(obsd.id) as size_count
FROM order_batch_assignments oba
JOIN orders o ON o.id = oba.order_id
JOIN batches b ON b.id = oba.batch_id
LEFT JOIN order_batch_size_distributions obsd ON obsd.order_batch_assignment_id = oba.id
WHERE o.order_number LIKE '%TUC/25-26/OCT/014%'
GROUP BY oba.id, o.order_number, b.batch_name, oba.total_quantity;

-- Test 4: Check current view definition
SELECT 
    'Current View Definition' as test_name,
    pg_get_viewdef('order_batch_assignments_with_details'::regclass, true) as view_definition;
