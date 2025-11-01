-- Fix the relationship between customers and customer_types tables
-- This script will create the proper foreign key relationship

-- First, check the current structure of both tables
SELECT 'Current customers table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'customers' 
ORDER BY ordinal_position;

SELECT 'Current customer_types table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'customer_types' 
ORDER BY ordinal_position;

-- Check if customers table has customer_type column
DO $$
BEGIN
    -- Add customer_type column to customers table if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customers' AND column_name = 'customer_type'
    ) THEN
        ALTER TABLE customers ADD COLUMN customer_type INTEGER;
        RAISE NOTICE 'Added customer_type column to customers table';
    ELSE
        RAISE NOTICE 'customer_type column already exists in customers table';
    END IF;
END $$;

-- Create foreign key relationship
DO $$
BEGIN
    -- Check if foreign key constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'customers' 
        AND constraint_type = 'FOREIGN KEY' 
        AND constraint_name LIKE '%customer_type%'
    ) THEN
        -- Add foreign key constraint
        ALTER TABLE customers 
        ADD CONSTRAINT fk_customers_customer_type 
        FOREIGN KEY (customer_type) REFERENCES customer_types(id);
        RAISE NOTICE 'Added foreign key constraint between customers and customer_types';
    ELSE
        RAISE NOTICE 'Foreign key constraint already exists';
    END IF;
END $$;

-- Update existing customers to have a default customer type (Retail)
UPDATE customers 
SET customer_type = (SELECT id FROM customer_types WHERE name = 'Retail' LIMIT 1)
WHERE customer_type IS NULL;

-- Verify the relationship
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
