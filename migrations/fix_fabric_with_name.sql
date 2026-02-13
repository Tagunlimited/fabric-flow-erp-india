-- Fix fabric foreign key issue with proper name
-- This script will create the missing fabric with a proper name

-- First, check the current structure of the fabrics table
SELECT 'Current fabrics table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'fabrics' 
ORDER BY ordinal_position;

-- Check if the problematic fabric_id exists
SELECT 'Checking if fabric exists:' as info;
SELECT * FROM fabrics WHERE id = '2efae02b-816f-467e-a895-72e979434dc1';

-- Create the missing fabric with proper name
INSERT INTO fabrics (id, name) 
VALUES ('2efae02b-816f-467e-a895-72e979434dc1', 'Dotknit Maroon 180 GSM')
ON CONFLICT (id) DO NOTHING;

-- Verify the fabric was created
SELECT 'Verifying fabric creation:' as info;
SELECT * FROM fabrics WHERE id = '2efae02b-816f-467e-a895-72e979434dc1';

-- Check for any other missing fabrics that might be referenced
SELECT 'Checking for other potential missing fabrics:' as info;
SELECT DISTINCT fabric_id 
FROM order_items 
WHERE fabric_id IS NOT NULL 
AND fabric_id NOT IN (SELECT id FROM fabrics);

-- Create placeholder records for any other missing fabrics
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
            INSERT INTO fabrics (id, name) 
            VALUES (missing_fabric_id, 'Unknown Fabric - ' || missing_fabric_id::text)
            ON CONFLICT (id) DO NOTHING;
            
            RAISE NOTICE 'Created placeholder fabric with ID: %', missing_fabric_id;
        END LOOP;
    ELSE
        RAISE NOTICE 'No missing fabrics found.';
    END IF;
END $$;

-- Final verification
SELECT 'Final verification - all fabrics:' as info;
SELECT * FROM fabrics ORDER BY created_at DESC LIMIT 10;

-- Refresh the schema cache
NOTIFY pgrst, 'reload schema';
