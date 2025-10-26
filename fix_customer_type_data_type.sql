-- Fix the data type mismatch between customers.customer_type and customer_types.id
-- This script will convert the customer_type column to integer type

-- First, check the current data types
SELECT 'Current customers table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'customers' AND column_name = 'customer_type';

SELECT 'Current customer_types table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'customer_types' AND column_name = 'id';

-- Check current data in customer_type column
SELECT 'Current customer_type data in customers table:' as info;
SELECT DISTINCT customer_type, COUNT(*) as count 
FROM customers 
WHERE customer_type IS NOT NULL 
GROUP BY customer_type;

-- Step 1: Create a temporary column with integer type
ALTER TABLE customers ADD COLUMN customer_type_temp INTEGER;

-- Step 2: Update the temporary column with mapped values
-- Map text values to customer_types IDs
UPDATE customers 
SET customer_type_temp = (
    CASE 
        WHEN customer_type = 'Wholesale' THEN (SELECT id FROM customer_types WHERE name = 'Wholesale' LIMIT 1)
        WHEN customer_type = 'Retail' THEN (SELECT id FROM customer_types WHERE name = 'Retail' LIMIT 1)
        WHEN customer_type = 'VIP' THEN (SELECT id FROM customer_types WHERE name = 'VIP' LIMIT 1)
        WHEN customer_type = 'Corporate' THEN (SELECT id FROM customer_types WHERE name = 'Corporate' LIMIT 1)
        WHEN customer_type = 'Staff' THEN (SELECT id FROM customer_types WHERE name = 'Staff' LIMIT 1)
        WHEN customer_type = 'B2B' THEN (SELECT id FROM customer_types WHERE name = 'Corporate' LIMIT 1)
        WHEN customer_type = 'B2C' THEN (SELECT id FROM customer_types WHERE name = 'Retail' LIMIT 1)
        WHEN customer_type = 'Enterprise' THEN (SELECT id FROM customer_types WHERE name = 'Corporate' LIMIT 1)
        ELSE (SELECT id FROM customer_types WHERE name = 'Retail' LIMIT 1) -- Default to Retail
    END
);

-- Step 3: Set default value for customers without customer_type
UPDATE customers 
SET customer_type_temp = (SELECT id FROM customer_types WHERE name = 'Retail' LIMIT 1)
WHERE customer_type_temp IS NULL;

-- Step 4: Drop the old column
ALTER TABLE customers DROP COLUMN customer_type;

-- Step 5: Rename the temporary column
ALTER TABLE customers RENAME COLUMN customer_type_temp TO customer_type;

-- Step 6: Add NOT NULL constraint
ALTER TABLE customers ALTER COLUMN customer_type SET NOT NULL;

-- Step 7: Create the foreign key constraint
ALTER TABLE customers 
ADD CONSTRAINT fk_customers_customer_type 
FOREIGN KEY (customer_type) REFERENCES customer_types(id);

-- Verify the changes
SELECT 'Updated customers table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'customers' AND column_name = 'customer_type';

-- Verify the relationship works
SELECT 'Verifying the relationship:' as info;
SELECT 
    c.id as customer_id,
    c.company_name,
    c.customer_type,
    ct.name as customer_type_name
FROM customers c
LEFT JOIN customer_types ct ON c.customer_type = ct.id
LIMIT 5;

-- Refresh the schema cache
NOTIFY pgrst, 'reload schema';
