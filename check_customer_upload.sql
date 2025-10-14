-- Check customer_types table (for Customer Type ID reference)
SELECT 'Customer Types:' as info;
SELECT id, name, description FROM customer_types ORDER BY id;

-- Check states table (for State ID reference)
SELECT 'States:' as info;
SELECT id, name, code FROM states ORDER BY id;

-- Test if we can insert a sample customer
SELECT 'Testing customer insert...' as info;

-- This will show if the foreign key constraints are working
-- You can uncomment and run this to test:
/*
INSERT INTO customers (
  company_name, 
  gstin, 
  mobile, 
  email, 
  customer_type_id, 
  address, 
  city, 
  state_id, 
  pincode, 
  loyalty_points
) VALUES (
  'Test Company',
  'GSTIN123456789',
  '9876543210',
  'test@example.com',
  1,  -- Customer Type ID 1 = Wholesale
  '123 Test Street',
  'Mumbai',
  15, -- State ID 15 = Maharashtra
  '400001',
  0
);
*/
