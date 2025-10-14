-- ============================================================================
-- DIAGNOSTIC: Check departments table structure
-- Generated: October 8, 2025
-- Description: Check what columns actually exist in the departments table
-- ============================================================================

-- Check if departments table exists
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'departments' AND table_schema = 'public') 
        THEN '✅ departments table exists'
        ELSE '❌ departments table does not exist'
    END as table_check;

-- Show all columns in departments table
SELECT 
    'departments table columns:' as info,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'departments' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if designations table exists
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'designations' AND table_schema = 'public') 
        THEN '✅ designations table exists'
        ELSE '❌ designations table does not exist'
    END as table_check;

-- Show all columns in designations table
SELECT 
    'designations table columns:' as info,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'designations' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if designation_departments table exists
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'designation_departments' AND table_schema = 'public') 
        THEN '✅ designation_departments table exists'
        ELSE '❌ designation_departments table does not exist'
    END as table_check;

-- Show all columns in designation_departments table
SELECT 
    'designation_departments table columns:' as info,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'designation_departments' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if designations_with_departments view exists
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'designations_with_departments' AND table_schema = 'public') 
        THEN '✅ designations_with_departments view exists'
        ELSE '❌ designations_with_departments view does not exist'
    END as view_check;

-- Show all columns in designations_with_departments view
SELECT 
    'designations_with_departments view columns:' as info,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'designations_with_departments' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Sample data from departments table (if it exists)
SELECT 
    'Sample departments data:' as info,
    COUNT(*) as total_departments
FROM departments;

-- Sample data from designations table (if it exists)
SELECT 
    'Sample designations data:' as info,
    COUNT(*) as total_designations
FROM designations;
