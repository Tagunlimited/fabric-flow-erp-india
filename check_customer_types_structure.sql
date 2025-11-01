-- Check the current structure of customer_types table
-- This will help us understand what columns actually exist

-- Check if customer_types table exists
SELECT 'Checking if customer_types table exists...' as info;
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_name = 'customer_types'
) as table_exists;

-- If table exists, show its structure
SELECT 'Current customer_types table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'customer_types' 
ORDER BY ordinal_position;

-- Show current data (if any)
SELECT 'Current data in customer_types table:' as info;
SELECT * FROM customer_types LIMIT 5;
