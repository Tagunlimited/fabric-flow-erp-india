-- Check the actual structure of supplier_master table
-- Run this to see what columns actually exist

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'supplier_master' 
ORDER BY ordinal_position;
