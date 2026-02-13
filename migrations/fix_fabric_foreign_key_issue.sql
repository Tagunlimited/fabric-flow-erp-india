-- Fix fabric foreign key constraint issue
-- This script will check the fabrics table and fix missing fabric records

-- First, check if the problematic fabric_id exists
SELECT 'Checking if fabric exists:' as info;
SELECT id, fabric_name, color, gsm, is_active 
FROM fabrics 
WHERE id = '2efae02b-816f-467e-a895-72e979434dc1';

-- Check all fabrics in the table
SELECT 'All fabrics in the table:' as info;
SELECT id, fabric_name, color, gsm, is_active, created_at 
FROM fabrics 
ORDER BY created_at DESC 
LIMIT 10;

-- Check if fabrics table exists and its structure
SELECT 'Fabrics table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'fabrics' 
ORDER BY ordinal_position;

-- If the fabric doesn't exist, create it
INSERT INTO fabrics (
    id,
    fabric_name,
    color,
    gsm,
    is_active,
    created_at,
    updated_at
) VALUES (
    '2efae02b-816f-467e-a895-72e979434dc1',
    'Dotknit',
    'Maroon',
    '180 GSM',
    true,
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- Verify the fabric was created
SELECT 'Verifying fabric creation:' as info;
SELECT id, fabric_name, color, gsm, is_active 
FROM fabrics 
WHERE id = '2efae02b-816f-467e-a895-72e979434dc1';

-- Check for any other missing fabrics that might be referenced
SELECT 'Checking for other potential missing fabrics:' as info;
SELECT DISTINCT fabric_id 
FROM order_items 
WHERE fabric_id IS NOT NULL 
AND fabric_id NOT IN (SELECT id FROM fabrics);

-- If there are other missing fabrics, create them as well
-- This is a safety measure to prevent future issues
DO $$
DECLARE
    missing_fabric_id UUID;
    fabric_count INTEGER;
BEGIN
    -- Get count of missing fabrics
    SELECT COUNT(*) INTO fabric_count
    FROM (
        SELECT DISTINCT fabric_id 
        FROM order_items 
        WHERE fabric_id IS NOT NULL 
        AND fabric_id NOT IN (SELECT id FROM fabrics)
    ) AS missing_fabrics;
    
    IF fabric_count > 0 THEN
        RAISE NOTICE 'Found % missing fabric(s), creating placeholder records...', fabric_count;
        
        -- Create placeholder records for missing fabrics
        FOR missing_fabric_id IN 
            SELECT DISTINCT fabric_id 
            FROM order_items 
            WHERE fabric_id IS NOT NULL 
            AND fabric_id NOT IN (SELECT id FROM fabrics)
        LOOP
            INSERT INTO fabrics (
                id,
                fabric_name,
                color,
                gsm,
                is_active,
                created_at,
                updated_at
            ) VALUES (
                missing_fabric_id,
                'Unknown Fabric',
                'Unknown Color',
                'Unknown GSM',
                true,
                NOW(),
                NOW()
            ) ON CONFLICT (id) DO NOTHING;
            
            RAISE NOTICE 'Created placeholder fabric with ID: %', missing_fabric_id;
        END LOOP;
    ELSE
        RAISE NOTICE 'No missing fabrics found.';
    END IF;
END $$;

-- Final verification
SELECT 'Final verification - all fabrics:' as info;
SELECT id, fabric_name, color, gsm, is_active 
FROM fabrics 
ORDER BY created_at DESC 
LIMIT 10;

-- Refresh the schema cache
NOTIFY pgrst, 'reload schema';
