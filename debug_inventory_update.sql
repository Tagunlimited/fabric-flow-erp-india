-- Debug script to check warehouse inventory and fabric picking
-- Run this to understand why inventory might not be updating

-- 1. Check warehouse_inventory table structure
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'warehouse_inventory' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Check if there are any fabric items in warehouse_inventory
SELECT 
    id,
    item_id,
    item_name,
    item_type,
    quantity,
    bin_id,
    status,
    created_at
FROM warehouse_inventory 
WHERE item_type = 'FABRIC'
ORDER BY created_at DESC
LIMIT 10;

-- 3. Check fabric_picking_records table
SELECT 
    id,
    order_id,
    fabric_id,
    picked_quantity,
    unit,
    picked_by_id,
    picked_by_name,
    created_at
FROM fabric_picking_records 
ORDER BY created_at DESC
LIMIT 10;

-- 4. Check if there are any bins with fabric inventory
SELECT 
    b.id as bin_id,
    b.bin_code,
    b.location_type,
    wi.item_name,
    wi.quantity,
    wi.item_type
FROM bins b
LEFT JOIN warehouse_inventory wi ON b.id = wi.bin_id
WHERE wi.item_type = 'FABRIC' OR wi.item_type IS NULL
ORDER BY b.bin_code, wi.item_name;

-- 5. Check fabric_storage_zones table
SELECT 
    id,
    zone_name,
    zone_code,
    location,
    is_active
FROM fabric_storage_zones
ORDER BY zone_name;

-- 6. Sample query to test inventory matching
-- Replace 'YOUR_FABRIC_ID' and 'YOUR_BIN_ID' with actual values
/*
SELECT 
    id,
    item_id,
    item_name,
    quantity,
    bin_id
FROM warehouse_inventory 
WHERE item_type = 'FABRIC'
  AND bin_id = 'YOUR_BIN_ID'
  AND (item_id = 'YOUR_FABRIC_ID' OR item_name = 'YOUR_FABRIC_NAME');
*/
