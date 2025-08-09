-- Verification script to check if BOM tables exist
-- Run this in your Supabase Dashboard SQL Editor

-- Check if BOM tables exist
SELECT 
  table_name, 
  table_type,
  'EXISTS' as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('bom_records', 'bom_record_items')
ORDER BY table_name;

-- Check table structure if they exist
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'bom_records'
ORDER BY ordinal_position;

SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'bom_record_items'
ORDER BY ordinal_position;

-- Check if there are any existing records
SELECT 
  'bom_records' as table_name,
  COUNT(*) as record_count
FROM bom_records
UNION ALL
SELECT 
  'bom_record_items' as table_name,
  COUNT(*) as record_count
FROM bom_record_items;
