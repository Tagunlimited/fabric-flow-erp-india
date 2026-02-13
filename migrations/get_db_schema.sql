-- Query to get complete database schema
-- Run this in Supabase SQL Editor and save the results

-- 1. Get all table names
SELECT 
    '=== ALL TABLES ===' as section,
    COUNT(*) as total_count
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE';

-- 2. List all tables
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = 'public') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- 3. Get all columns for each table (use this to generate CREATE TABLE statements)
SELECT 
    c.table_name,
    c.column_name,
    c.data_type,
    c.character_maximum_length,
    c.numeric_precision,
    c.numeric_scale,
    c.is_nullable,
    c.column_default,
    CASE 
        WHEN pk.constraint_type = 'PRIMARY KEY' THEN 'YES'
        ELSE 'NO'
    END as is_primary_key,
    CASE
        WHEN fk.constraint_type = 'FOREIGN KEY' THEN fk_refs.table_name || '(' || fk_refs.column_name || ')'
        ELSE NULL
    END as foreign_key_reference
FROM information_schema.columns c
LEFT JOIN (
    SELECT tc.table_name, kcu.column_name, tc.constraint_type
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema = 'public'
) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
LEFT JOIN (
    SELECT tc.table_name, kcu.column_name, tc.constraint_type, tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
) fk ON c.table_name = fk.table_name AND c.column_name = fk.column_name
LEFT JOIN (
    SELECT 
        kcu.constraint_name,
        ccu.table_name,
        ccu.column_name
    FROM information_schema.key_column_usage kcu
    JOIN information_schema.constraint_column_usage ccu 
        ON kcu.constraint_name = ccu.constraint_name
    WHERE kcu.table_schema = 'public'
) fk_refs ON fk.constraint_name = fk_refs.constraint_name
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position;

-- 4. Get all enums
SELECT 
    '=== ALL ENUMS ===' as section,
    COUNT(DISTINCT t.typname) as total_count
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid  
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public';

SELECT 
    t.typname as enum_name,
    array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid  
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
GROUP BY t.typname
ORDER BY t.typname;

-- 5. Get all functions
SELECT 
    '=== ALL FUNCTIONS ===' as section,
    COUNT(*) as total_count
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public';

SELECT 
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_functiondef(p.oid) as full_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY p.proname;

-- 6. Get all triggers
SELECT 
    '=== ALL TRIGGERS ===' as section,
    COUNT(*) as total_count
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
AND NOT t.tgisinternal;

SELECT 
    t.tgname as trigger_name,
    c.relname as table_name,
    p.proname as function_name
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE n.nspname = 'public'
AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;

-- 7. Get all views
SELECT 
    '=== ALL VIEWS ===' as section,
    COUNT(*) as total_count
FROM information_schema.views
WHERE table_schema = 'public';

SELECT 
    table_name as view_name
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- 8. Get storage buckets
SELECT 
    '=== STORAGE BUCKETS ===' as section,
    COUNT(*) as total_count
FROM storage.buckets;

SELECT 
    id as bucket_name,
    public as is_public,
    file_size_limit,
    allowed_mime_types
FROM storage.buckets
ORDER BY id;

-- 9. Get all indexes
SELECT 
    '=== ALL INDEXES ===' as section,
    COUNT(*) as total_count
FROM pg_indexes
WHERE schemaname = 'public';

SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

