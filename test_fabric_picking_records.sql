-- Test script to verify fabric_picking_records table structure
-- This will help identify any schema issues

-- Check if table exists
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'fabric_picking_records' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- If table doesn't exist, show error
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'fabric_picking_records' 
        AND table_schema = 'public'
    ) THEN
        RAISE NOTICE 'Table fabric_picking_records does not exist!';
    ELSE
        RAISE NOTICE 'Table fabric_picking_records exists.';
    END IF;
END $$;
