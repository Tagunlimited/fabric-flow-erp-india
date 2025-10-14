-- Test script to verify receipt number generation fix
-- This script tests the database trigger and function

-- Test 1: Insert receipt without receipt_number (should auto-generate)
INSERT INTO receipts (
  reference_type,
  reference_id,
  reference_number,
  customer_id,
  payment_mode,
  payment_type,
  amount
) VALUES (
  'order',
  gen_random_uuid(),
  'TEST-001',
  (SELECT id FROM customers LIMIT 1),
  'UPI',
  'Advance',
  1000.00
);

-- Test 2: Insert another receipt (should get next sequence)
INSERT INTO receipts (
  reference_type,
  reference_id,
  reference_number,
  customer_id,
  payment_mode,
  payment_type,
  amount
) VALUES (
  'order',
  gen_random_uuid(),
  'TEST-002',
  (SELECT id FROM customers LIMIT 1),
  'UPI',
  'Advance',
  2000.00
);

-- Test 3: Verify the generated receipt numbers
SELECT 
  id,
  receipt_number,
  created_at,
  amount
FROM receipts 
WHERE reference_number IN ('TEST-001', 'TEST-002')
ORDER BY created_at;

-- Test 4: Check for any duplicate receipt numbers
SELECT 
  receipt_number,
  COUNT(*) as count
FROM receipts 
GROUP BY receipt_number 
HAVING COUNT(*) > 1;

-- Clean up test data
DELETE FROM receipts WHERE reference_number IN ('TEST-001', 'TEST-002');
