-- Test BOM data and table structure
-- Run this in Supabase SQL Editor to check the current state

-- 1. Check if tables exist
SELECT 'Table Check:' as info;
SELECT table_name, table_schema 
FROM information_schema.tables 
WHERE table_name IN ('bom_records', 'bom_record_items', 'bom_items') 
AND table_schema = 'public';

-- 2. Check bom_records table structure
SELECT 'BOM Records Structure:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'bom_records' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 3. Check bom_record_items table structure
SELECT 'BOM Record Items Structure:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'bom_record_items' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 4. Check if bom_items table exists and its structure
SELECT 'BOM Items Structure (if exists):' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'bom_items' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 5. Check current BOM records
SELECT 'Current BOM Records:' as info;
SELECT id, product_name, total_order_qty, created_at 
FROM public.bom_records 
ORDER BY created_at DESC 
LIMIT 5;

-- 6. Check current BOM items (try both table names)
SELECT 'Current BOM Record Items:' as info;
SELECT bom_id, item_name, category, qty_total, stock, to_order 
FROM public.bom_record_items 
ORDER BY created_at DESC 
LIMIT 10;

-- 7. If bom_items exists, check it too
SELECT 'Current BOM Items (if bom_items table exists):' as info;
SELECT bom_id, item_name, category, qty_total, stock, to_order 
FROM public.bom_items 
ORDER BY created_at DESC 
LIMIT 10;
