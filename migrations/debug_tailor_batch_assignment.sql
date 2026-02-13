-- Debug script to check tailor-batch assignment issues
-- Run this in Supabase SQL Editor to diagnose the problem

-- Check if batches table exists and has data
SELECT 'Batches Table Check' as check_type, COUNT(*) as count FROM public.batches;

-- Check if tailors table exists and has data
SELECT 'Tailors Table Check' as check_type, COUNT(*) as count FROM public.tailors;

-- Check tailors with batch assignments
SELECT 
    'Tailors with Batch ID' as check_type,
    COUNT(*) as count
FROM public.tailors 
WHERE batch_id IS NOT NULL;

-- Check tailors without batch assignments
SELECT 
    'Tailors without Batch ID' as check_type,
    COUNT(*) as count
FROM public.tailors 
WHERE batch_id IS NULL;

-- Show all batches with their IDs
SELECT 
    'Batch Details' as check_type,
    id,
    batch_name,
    batch_code,
    status,
    current_capacity,
    max_capacity
FROM public.batches
ORDER BY batch_name;

-- Show all tailors with their batch assignments
SELECT 
    'Tailor Details' as check_type,
    id,
    tailor_code,
    full_name,
    batch_id,
    is_batch_leader,
    tailor_type,
    status
FROM public.tailors
ORDER BY full_name;

-- Check for orphaned batch_id references (tailors pointing to non-existent batches)
SELECT 
    'Orphaned References' as check_type,
    t.id as tailor_id,
    t.full_name,
    t.batch_id,
    b.id as batch_exists
FROM public.tailors t
LEFT JOIN public.batches b ON t.batch_id = b.id
WHERE t.batch_id IS NOT NULL AND b.id IS NULL;

-- Check batch-tailor relationships
SELECT 
    'Batch-Tailor Relationships' as check_type,
    b.batch_name,
    b.id as batch_id,
    COUNT(t.id) as assigned_tailors,
    COUNT(CASE WHEN t.is_batch_leader THEN 1 END) as leaders
FROM public.batches b
LEFT JOIN public.tailors t ON b.id = t.batch_id
GROUP BY b.id, b.batch_name
ORDER BY b.batch_name;
