-- ============================================================================
-- Verification Script: Multi-BOM Purchase Order Tracking
-- Date: January 7, 2025
-- Description: Verify that the bom_id column is properly added and working
-- ============================================================================

-- ============================================================================
-- PART 1: VERIFY SCHEMA CHANGES
-- ============================================================================

SELECT '=== Checking if bom_id column exists in purchase_order_items ===' as status;

SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'purchase_order_items' 
  AND table_schema = 'public'
  AND column_name IN ('bom_id', 'remarks')
ORDER BY column_name;

-- Verify index exists
SELECT '=== Checking if index exists ===' as status;

SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'purchase_order_items' 
  AND indexname = 'idx_purchase_order_items_bom_id';

-- ============================================================================
-- PART 2: VERIFY DATA INTEGRITY
-- ============================================================================

SELECT '=== Checking foreign key constraint ===' as status;

SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'purchase_order_items'
    AND kcu.column_name = 'bom_id';

-- ============================================================================
-- PART 3: CHECK EXISTING DATA
-- ============================================================================

SELECT '=== Summary of existing PO items ===' as status;

SELECT 
    COUNT(*) as total_po_items,
    COUNT(bom_id) as items_with_bom_id,
    COUNT(*) - COUNT(bom_id) as items_without_bom_id,
    ROUND(100.0 * COUNT(bom_id) / NULLIF(COUNT(*), 0), 2) as percent_with_bom_id
FROM purchase_order_items;

-- Show sample of PO items with their BOM IDs
SELECT '=== Sample PO items with BOM IDs ===' as status;

SELECT 
    poi.id,
    poi.item_name,
    poi.item_type,
    poi.quantity,
    poi.bom_id,
    br.bom_number,
    br.product_name,
    po.po_number
FROM purchase_order_items poi
LEFT JOIN bom_records br ON poi.bom_id = br.id
LEFT JOIN purchase_orders po ON poi.po_id = po.id
WHERE poi.bom_id IS NOT NULL
LIMIT 10;

-- ============================================================================
-- PART 4: ANALYZE BOM FULFILLMENT
-- ============================================================================

SELECT '=== BOMs and their fulfillment status ===' as status;

WITH bom_items AS (
    SELECT 
        br.id as bom_id,
        br.bom_number,
        br.product_name,
        COUNT(DISTINCT bri.id) as total_bom_items,
        SUM(bri.qty_total) as total_required_qty
    FROM bom_records br
    LEFT JOIN bom_record_items bri ON br.id = bri.bom_id
    GROUP BY br.id, br.bom_number, br.product_name
),
po_items AS (
    SELECT 
        poi.bom_id,
        COUNT(DISTINCT poi.id) as total_po_items,
        SUM(poi.quantity) as total_ordered_qty
    FROM purchase_order_items poi
    WHERE poi.bom_id IS NOT NULL
    GROUP BY poi.bom_id
)
SELECT 
    bi.bom_number,
    bi.product_name,
    bi.total_bom_items,
    COALESCE(pi.total_po_items, 0) as items_ordered,
    ROUND(bi.total_required_qty::numeric, 2) as total_required,
    ROUND(COALESCE(pi.total_ordered_qty, 0)::numeric, 2) as total_ordered,
    CASE 
        WHEN pi.bom_id IS NULL THEN '⏳ Pending'
        WHEN pi.total_ordered_qty >= bi.total_required_qty THEN '✅ Fully Ordered'
        ELSE '📊 Partially Ordered'
    END as status
FROM bom_items bi
LEFT JOIN po_items pi ON bi.bom_id = pi.bom_id
ORDER BY bi.bom_number DESC
LIMIT 20;

-- ============================================================================
-- PART 5: CHECK FOR MULTI-BOM POs
-- ============================================================================

SELECT '=== POs that fulfill multiple BOMs ===' as status;

WITH po_bom_count AS (
    SELECT 
        po_id,
        COUNT(DISTINCT bom_id) as bom_count,
        array_agg(DISTINCT bom_id) as bom_ids
    FROM purchase_order_items
    WHERE bom_id IS NOT NULL
    GROUP BY po_id
    HAVING COUNT(DISTINCT bom_id) > 1
)
SELECT 
    po.po_number,
    po.order_date,
    pbc.bom_count as number_of_boms_fulfilled,
    s.supplier_name,
    (
        SELECT string_agg(br.bom_number, ', ')
        FROM bom_records br
        WHERE br.id = ANY(pbc.bom_ids)
    ) as bom_numbers
FROM po_bom_count pbc
JOIN purchase_orders po ON pbc.po_id = po.id
LEFT JOIN supplier_master s ON po.supplier_id = s.id
ORDER BY pbc.bom_count DESC, po.created_at DESC
LIMIT 10;

-- ============================================================================
-- PART 6: VALIDATION CHECKS
-- ============================================================================

SELECT '=== Validation: Check for orphaned bom_ids ===' as status;

SELECT 
    poi.id,
    poi.item_name,
    poi.bom_id,
    'Orphaned BOM ID' as issue
FROM purchase_order_items poi
WHERE poi.bom_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM bom_records br WHERE br.id = poi.bom_id
  )
LIMIT 10;

SELECT '=== Summary ===' as status;
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'purchase_order_items' 
              AND column_name = 'bom_id'
        ) THEN '✅ Schema migration successful'
        ELSE '❌ Schema migration failed - bom_id column not found'
    END as migration_status,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = 'purchase_order_items' 
              AND indexname = 'idx_purchase_order_items_bom_id'
        ) THEN '✅ Index created successfully'
        ELSE '❌ Index not found'
    END as index_status,
    CASE 
        WHEN (SELECT COUNT(*) FROM purchase_order_items WHERE bom_id IS NOT NULL) > 0 
        THEN '✅ Data being tracked with BOM IDs'
        ELSE '⏳ No data yet (expected for new installation)'
    END as data_status;

-- ============================================================================
-- PART 7: SUGGESTED NEXT STEPS
-- ============================================================================

SELECT '=== NEXT STEPS ===' as info;
SELECT '
1. ✅ Verify that the bom_id column exists in purchase_order_items
2. ✅ Check that the index was created for performance
3. 🔍 Create a test BOM with some items
4. 🔍 Create a PO from that BOM
5. 🔍 Run this script again to verify bom_id is populated
6. 🔍 Create another BOM with similar items
7. 🔍 Create a PO from both BOMs together
8. 🔍 Verify both BOMs are marked as having PO created
9. 🔍 Check the "Pending" tab to ensure both BOMs disappeared
10. 🎉 Migration complete and working!
' as steps;

