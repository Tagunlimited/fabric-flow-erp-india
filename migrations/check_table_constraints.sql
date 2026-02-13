-- Check Table Constraints and Structure
-- Run this in your Supabase SQL Editor to see what tables exist and their constraints

-- Check if tables exist
SELECT 'Table Existence Check:' as info;
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('supplier_master', 'fabric_master', 'item_master', 'goods_receipt_notes', 'grn_master', 'grn_items', 'warehouse_inventory', 'bins')
ORDER BY table_name;

-- Check unique constraints for supplier_master
SELECT 'Supplier Master Constraints:' as info;
SELECT constraint_name, constraint_type, column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'supplier_master' AND tc.table_schema = 'public'
ORDER BY constraint_type, column_name;

-- Check unique constraints for fabric_master
SELECT 'Fabric Master Constraints:' as info;
SELECT constraint_name, constraint_type, column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'fabric_master' AND tc.table_schema = 'public'
ORDER BY constraint_type, column_name;

-- Check unique constraints for item_master
SELECT 'Item Master Constraints:' as info;
SELECT constraint_name, constraint_type, column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'item_master' AND tc.table_schema = 'public'
ORDER BY constraint_type, column_name;

-- Check unique constraints for goods_receipt_notes
SELECT 'Goods Receipt Notes Constraints:' as info;
SELECT constraint_name, constraint_type, column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'goods_receipt_notes' AND tc.table_schema = 'public'
ORDER BY constraint_type, column_name;

-- Check unique constraints for grn_master (alternative table name)
SELECT 'GRN Master Constraints:' as info;
SELECT constraint_name, constraint_type, column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'grn_master' AND tc.table_schema = 'public'
ORDER BY constraint_type, column_name;

-- Check unique constraints for grn_items
SELECT 'GRN Items Constraints:' as info;
SELECT constraint_name, constraint_type, column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'grn_items' AND tc.table_schema = 'public'
ORDER BY constraint_type, column_name;

-- Check if warehouse_inventory table exists
SELECT 'Warehouse Inventory Constraints:' as info;
SELECT constraint_name, constraint_type, column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'warehouse_inventory' AND tc.table_schema = 'public'
ORDER BY constraint_type, column_name;

-- Check if bins table exists
SELECT 'Bins Constraints:' as info;
SELECT constraint_name, constraint_type, column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'bins' AND tc.table_schema = 'public'
ORDER BY constraint_type, column_name;
