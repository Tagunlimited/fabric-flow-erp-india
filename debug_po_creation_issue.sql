-- Debug PO creation issue - check for constraints and data integrity

-- Check current state of purchase_orders table
SELECT 
  id,
  po_number,
  bom_id,
  supplier_id,
  status,
  created_at,
  updated_at
FROM purchase_orders 
ORDER BY created_at DESC;

-- Check for unique constraints on purchase_orders table
SELECT 
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'purchase_orders'::regclass;

-- Check if there are any triggers on purchase_orders table
SELECT 
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'purchase_orders';

-- Check for any RLS policies that might affect PO creation
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
WHERE tablename = 'purchase_orders';

-- Check if there are any duplicate PO numbers
SELECT 
  po_number,
  COUNT(*) as count
FROM purchase_orders 
GROUP BY po_number
HAVING COUNT(*) > 1;

-- Check if there are any POs with same bom_id but different po_number
SELECT 
  bom_id,
  COUNT(*) as po_count,
  STRING_AGG(po_number, ', ') as po_numbers
FROM purchase_orders 
WHERE bom_id IS NOT NULL
GROUP BY bom_id
HAVING COUNT(*) > 1;
