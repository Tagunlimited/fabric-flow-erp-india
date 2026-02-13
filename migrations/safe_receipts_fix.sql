-- SAFE RECEIPTS TABLE FIX (Avoids Deadlocks)
-- Run this script in Supabase SQL Editor step by step

-- Step 1: First, let's check what exists
SELECT 'Checking existing receipts table...' as status;

-- Check if receipts table exists and its structure
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'receipts' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if function exists
SELECT 
    routine_name,
    routine_type
FROM information_schema.routines 
WHERE routine_name = 'generate_receipt_number' 
AND routine_schema = 'public';

-- Check if trigger exists
SELECT 
    trigger_name,
    event_manipulation,
    action_timing
FROM information_schema.triggers 
WHERE trigger_name = 'receipts_generate_number' 
AND event_object_table = 'receipts';
