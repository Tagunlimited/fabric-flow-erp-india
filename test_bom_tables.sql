-- Test script to verify BOM tables creation and functionality
-- Run this after applying the migration to test the tables

-- Test 1: Check if tables exist
SELECT 
  table_name,
  table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('bom_records', 'bom_record_items')
ORDER BY table_name;

-- Test 2: Check table structure
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'bom_records'
ORDER BY ordinal_position;

SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'bom_record_items'
ORDER BY ordinal_position;

-- Test 3: Check foreign key constraints
SELECT 
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_name IN ('bom_records', 'bom_record_items');

-- Test 4: Check RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename IN ('bom_records', 'bom_record_items');

-- Test 5: Check indexes
SELECT 
  indexname,
  tablename,
  indexdef
FROM pg_indexes 
WHERE tablename IN ('bom_records', 'bom_record_items');

-- Test 6: Verify table comments
SELECT 
  t.table_name,
  col.column_name,
  col.column_comment
FROM information_schema.tables t
LEFT JOIN information_schema.columns col ON t.table_name = col.table_name
WHERE t.table_schema = 'public' 
AND t.table_name IN ('bom_records', 'bom_record_items')
AND col.column_comment IS NOT NULL
ORDER BY t.table_name, col.ordinal_position;

-- Test 7: Try to insert a test record (if you have sample data)
-- Note: This will only work if you have existing orders and item_master data
-- Uncomment and modify the following if you want to test inserts:

/*
-- Insert test BOM record (modify order_id and other values as needed)
INSERT INTO bom_records (
  order_id,
  product_name,
  total_order_qty
) VALUES (
  (SELECT id FROM orders LIMIT 1), -- Replace with actual order ID
  'Test Product',
  100
) RETURNING id;

-- Insert test BOM item (modify bom_id and other values as needed)
INSERT INTO bom_record_items (
  bom_id,
  item_name,
  category,
  unit_of_measure,
  qty_per_product,
  qty_total
) VALUES (
  (SELECT id FROM bom_records LIMIT 1), -- Replace with actual BOM ID
  'Test Item',
  'Raw Material',
  'PCS',
  2.5,
  250
);

-- Query the test data
SELECT 
  br.id as bom_id,
  br.product_name,
  br.total_order_qty,
  bri.item_name,
  bri.qty_per_product,
  bri.qty_total
FROM bom_records br
JOIN bom_record_items bri ON br.id = bri.bom_id
WHERE br.product_name = 'Test Product';

-- Clean up test data
DELETE FROM bom_record_items WHERE item_name = 'Test Item';
DELETE FROM bom_records WHERE product_name = 'Test Product';
*/
