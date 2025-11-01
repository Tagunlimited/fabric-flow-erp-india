-- Remove credit_days column from customer_types table
-- This script will remove the credit_days field from the customer_types table

-- First, check if the column exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'customer_types' 
        AND column_name = 'credit_days'
    ) THEN
        -- Remove the credit_days column
        ALTER TABLE customer_types DROP COLUMN credit_days;
        RAISE NOTICE 'Successfully removed credit_days column from customer_types table';
    ELSE
        RAISE NOTICE 'credit_days column does not exist in customer_types table';
    END IF;
END $$;

-- Verify the table structure after removal
SELECT 'Customer Types Table Structure After Credit Days Removal:' as status;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'customer_types' 
ORDER BY ordinal_position;

-- Show current data
SELECT 'Current Customer Types (without credit_days):' as info;
SELECT id, name, description, discount_percentage, is_active, created_at 
FROM customer_types 
ORDER BY id;
