-- Check the current structure of the fabrics table
-- This will help us understand what columns actually exist

-- Check if fabrics table exists
SELECT 'Checking if fabrics table exists...' as info;
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_name = 'fabrics'
) as table_exists;

-- If table exists, show its structure
SELECT 'Current fabrics table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'fabrics' 
ORDER BY ordinal_position;

-- Show current data (if any)
SELECT 'Current data in fabrics table:' as info;
SELECT * FROM fabrics LIMIT 5;
