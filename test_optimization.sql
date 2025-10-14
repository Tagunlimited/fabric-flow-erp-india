-- Test script to verify database optimization
-- Run this after running optimize_database.sql to check if everything works

-- 1. Check if indexes were created
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('purchase_orders', 'purchase_order_items', 'supplier_master')
    AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- 2. Check if materialized view was created
SELECT 
    schemaname,
    matviewname,
    definition
FROM pg_matviews 
WHERE matviewname = 'po_summary_view';

-- 3. Check if functions were created
SELECT 
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines 
WHERE routine_name IN ('get_purchase_orders_optimized', 'refresh_po_summary', 'trigger_refresh_po_summary')
ORDER BY routine_name;

-- 4. Test the optimized function (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'get_purchase_orders_optimized') THEN
        RAISE NOTICE 'Testing get_purchase_orders_optimized function...';
        -- This will show the first 5 purchase orders
        PERFORM * FROM get_purchase_orders_optimized(5, 0, NULL, NULL);
        RAISE NOTICE 'Function test completed successfully!';
    ELSE
        RAISE NOTICE 'get_purchase_orders_optimized function does not exist.';
    END IF;
END $$;

-- 5. Check table statistics
SELECT 
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes,
    n_live_tup as live_tuples,
    n_dead_tup as dead_tuples,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables 
WHERE tablename IN ('purchase_orders', 'purchase_order_items', 'supplier_master')
ORDER BY tablename;

-- 6. Performance test - compare query execution times
-- This will show how long it takes to fetch purchase orders
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

-- 7. Check if triggers were created
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers 
WHERE trigger_name LIKE '%po_summary%'
ORDER BY trigger_name;

-- 8. Summary report
SELECT 
    'Indexes Created' as item,
    COUNT(*) as count
FROM pg_indexes 
WHERE tablename IN ('purchase_orders', 'purchase_order_items', 'supplier_master')
    AND indexname LIKE 'idx_%'

UNION ALL

SELECT 
    'Materialized Views' as item,
    COUNT(*) as count
FROM pg_matviews 
WHERE matviewname = 'po_summary_view'

UNION ALL

SELECT 
    'Functions Created' as item,
    COUNT(*) as count
FROM information_schema.routines 
WHERE routine_name IN ('get_purchase_orders_optimized', 'refresh_po_summary', 'trigger_refresh_po_summary')

UNION ALL

SELECT 
    'Triggers Created' as item,
    COUNT(*) as count
FROM information_schema.triggers 
WHERE trigger_name LIKE '%po_summary%';
