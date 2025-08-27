-- Check customer table structure
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'customers' 
ORDER BY ordinal_position;

-- Check customer_types table
SELECT * FROM customer_types ORDER BY id;

-- Check states table (showing first 10 for reference)
SELECT id, name, code FROM states ORDER BY id LIMIT 10;

-- Show all states for reference
SELECT id, name, code FROM states ORDER BY id;

-- Test customer insert with valid foreign keys
-- This will help identify the correct format

-- First, let's see what customer_type_id values are valid:
SELECT 'Customer Types:' as info;
SELECT id, name FROM customer_types ORDER BY id;

-- Then, let's see what state_id values are valid:
SELECT 'States:' as info;
SELECT id, name, code FROM states ORDER BY id;

-- Example of valid customer insert:
-- INSERT INTO customers (
--   company_name, 
--   gstin, 
--   mobile, 
--   email, 
--   customer_type_id, 
--   address, 
--   city, 
--   state_id, 
--   pincode, 
--   loyalty_points
-- ) VALUES (
--   'Test Company',
--   'GSTIN123456789',
--   '9876543210',
--   'test@example.com',
--   1,  -- This must be a valid customer_type_id
--   '123 Test Street',
--   'Mumbai',
--   15, -- This must be a valid state_id (Maharashtra)
--   '400001',
--   0
-- );
