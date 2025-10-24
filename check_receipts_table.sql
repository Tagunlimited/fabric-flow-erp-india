-- Check if receipts table exists and what data it contains

-- Check if receipts table exists
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'receipts'
) as receipts_table_exists;

-- If table exists, show its structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'receipts'
ORDER BY ordinal_position;

-- If table exists, show count of records
SELECT COUNT(*) as total_receipts FROM public.receipts;

-- If table exists, show sample data (first 5 records)
SELECT * FROM public.receipts 
ORDER BY created_at DESC 
LIMIT 5;
