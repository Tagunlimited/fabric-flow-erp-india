-- Quick check for batch assignment issues
-- Run this in Supabase SQL Editor

-- Check if foreign key exists
SELECT 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
AND tc.table_name='tailors'
AND kcu.column_name='batch_id';

-- Check tailor data with batch info
SELECT 
    t.id,
    t.tailor_code,
    t.full_name,
    t.batch_id,
    b.batch_name,
    b.batch_code
FROM public.tailors t
LEFT JOIN public.batches b ON t.batch_id = b.id
ORDER BY t.full_name;

-- Check if any tailors have batch_id but no matching batch
SELECT 
    t.id,
    t.tailor_code,
    t.full_name,
    t.batch_id,
    'ORPHANED' as status
FROM public.tailors t
LEFT JOIN public.batches b ON t.batch_id = b.id
WHERE t.batch_id IS NOT NULL AND b.id IS NULL;

-- Check batches
SELECT id, batch_name, batch_code, status FROM public.batches ORDER BY batch_name;
