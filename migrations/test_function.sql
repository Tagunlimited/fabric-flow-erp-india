-- Simple test script to verify the get_purchase_orders_optimized function
-- Run this after running optimize_database_simple.sql

-- 1. Check if the function exists
SELECT 
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines 
WHERE routine_name = 'get_purchase_orders_optimized';

-- 2. Test the function with different parameters
-- Test 1: Get first 5 purchase orders
SELECT 'Test 1: First 5 purchase orders' as test_name;
SELECT * FROM get_purchase_orders_optimized(5, 0, NULL, NULL);

-- Test 2: Get purchase orders with specific status (if any exist)
SELECT 'Test 2: Purchase orders with status' as test_name;
SELECT * FROM get_purchase_orders_optimized(5, 0, 'draft', NULL);

-- Test 3: Search for purchase orders
SELECT 'Test 3: Search purchase orders' as test_name;
SELECT * FROM get_purchase_orders_optimized(5, 0, NULL, 'PO');

-- 3. Compare performance with regular query
SELECT 'Performance comparison:' as test_name;

-- Regular query
EXPLAIN (ANALYZE, BUFFERS) 
SELECT 
    po.id,
    po.po_number,
    po.supplier_id,
    po.order_date,
    po.status,
    po.total_amount,
    s.supplier_name,
    s.supplier_code,
    s.contact_person,
    s.phone,
    s.email
FROM purchase_orders po
LEFT JOIN supplier_master s ON po.supplier_id = s.id
ORDER BY po.created_at DESC
LIMIT 10;

-- Optimized function query
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM get_purchase_orders_optimized(10, 0, NULL, NULL);

-- 4. Check indexes
SELECT 
    schemaname,
    tablename,
    indexname
FROM pg_indexes 
WHERE tablename IN ('purchase_orders', 'purchase_order_items', 'supplier_master')
    AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
