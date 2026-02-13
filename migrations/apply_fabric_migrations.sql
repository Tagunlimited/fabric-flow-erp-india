-- Apply fabric-related migrations to fix the picking dialog issue
-- Run this script to ensure all required tables exist

-- 1. Apply the fabric picking records migration
\i supabase/migrations/20250115000000_ensure_fabric_picking_records_table.sql

-- 2. Apply the complete fabric tables migration
\i supabase/migrations/20250115000001_ensure_fabric_tables_complete.sql

-- 3. Test the table structure
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'fabric_picking_records' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- 4. Test inserting a sample record (will be rolled back)
BEGIN;
INSERT INTO fabric_picking_records (
    order_id, 
    fabric_id, 
    picked_quantity, 
    unit, 
    picked_by, 
    notes
) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    1.0,
    'meters',
    NULL,
    'Test record'
);
ROLLBACK;

SELECT 'Fabric picking records table is ready!' as status;
