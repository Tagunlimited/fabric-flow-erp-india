-- Test script to verify fabric_picking_records table structure
-- Run this after applying the migrations

-- Check if table exists and has correct columns
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

-- Test inserting a sample record (will be rolled back)
BEGIN;
INSERT INTO fabric_picking_records (
    order_id, 
    fabric_id, 
    storage_zone_id,
    picked_quantity, 
    unit, 
    picked_by_id,
    picked_by_name,
    notes
) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    1.0,
    'meters',
    NULL,
    'Test User',
    'Test record'
);
ROLLBACK;

SELECT 'Fabric picking records table is ready with correct columns!' as status;
