-- Verify if tailor management tables exist and have data
-- Run this in Supabase SQL Editor to check the current state

-- Check if tables exist
SELECT 
    table_name,
    CASE 
        WHEN table_name IN ('tailors', 'batches', 'tailor_assignments', 'tailor_skills', 'tailor_attendance') 
        THEN 'EXISTS' 
        ELSE 'MISSING' 
    END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('tailors', 'batches', 'tailor_assignments', 'tailor_skills', 'tailor_attendance')
ORDER BY table_name;

-- Check tailor count
SELECT 'tailors' as table_name, COUNT(*) as record_count FROM public.tailors
UNION ALL
SELECT 'batches' as table_name, COUNT(*) as record_count FROM public.batches
UNION ALL
SELECT 'employees_with_tailor_type' as table_name, COUNT(*) as record_count FROM public.employees WHERE tailor_type IS NOT NULL;

-- Check if any tailors have batch assignments
SELECT 
    t.full_name,
    t.tailor_code,
    t.batch_id,
    b.batch_name,
    t.is_batch_leader
FROM public.tailors t
LEFT JOIN public.batches b ON t.batch_id = b.id
ORDER BY t.full_name;

-- Check batch details
SELECT 
    b.batch_name,
    b.batch_code,
    b.status,
    COUNT(t.id) as tailor_count,
    COUNT(CASE WHEN t.is_batch_leader THEN 1 END) as leader_count
FROM public.batches b
LEFT JOIN public.tailors t ON b.id = t.batch_id
GROUP BY b.id, b.batch_name, b.batch_code, b.status
ORDER BY b.batch_name;
