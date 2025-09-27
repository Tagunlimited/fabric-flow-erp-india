-- Verification script to check warehouse inventory system
-- Run this in your Supabase Dashboard SQL Editor

-- 1. Check if warehouse inventory tables exist
SELECT 
  table_name, 
  table_type,
  'EXISTS' as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('warehouse_inventory', 'inventory_movements', 'floors', 'racks', 'bins')
ORDER BY table_name;

-- 2. Check warehouse structure
SELECT 'WAREHOUSES' as level, COUNT(*) as count FROM warehouses
UNION ALL
SELECT 'FLOORS' as level, COUNT(*) as count FROM floors
UNION ALL
SELECT 'RACKS' as level, COUNT(*) as count FROM racks
UNION ALL
SELECT 'BINS' as level, COUNT(*) as count FROM bins;

-- 3. Check bins by location type
SELECT 
  location_type,
  COUNT(*) as bin_count
FROM bins
GROUP BY location_type
ORDER BY location_type;

-- 4. Check approved GRNs
SELECT 
  'APPROVED_GRNS' as status,
  COUNT(*) as count
FROM grn_master
WHERE status = 'approved'
UNION ALL
SELECT 
  'TOTAL_GRNS' as status,
  COUNT(*) as count
FROM grn_master;

-- 5. Check approved GRN items
SELECT 
  'APPROVED_GRN_ITEMS' as status,
  COUNT(*) as count
FROM grn_items gi
JOIN grn_master gm ON gi.grn_id = gm.id
WHERE gm.status = 'approved' AND gi.quality_status = 'approved';

-- 6. Check warehouse inventory items
SELECT 
  'WAREHOUSE_INVENTORY_ITEMS' as status,
  COUNT(*) as count
FROM warehouse_inventory;

-- 7. Check receiving zone items (if view exists)
SELECT 
  'RECEIVING_ZONE_ITEMS' as status,
  COUNT(*) as count
FROM receiving_zone_items;

-- 8. Show sample receiving zone items
SELECT 
  item_name,
  item_code,
  quantity,
  unit,
  bin_code,
  warehouse_name,
  grn_number,
  received_date
FROM receiving_zone_items
LIMIT 10;

-- 9. Check if there are any approved GRNs without warehouse inventory entries
SELECT 
  gm.grn_number,
  gm.status as grn_status,
  COUNT(gi.id) as approved_items,
  COUNT(wi.id) as warehouse_entries
FROM grn_master gm
JOIN grn_items gi ON gm.id = gi.grn_id
LEFT JOIN warehouse_inventory wi ON gi.id = wi.grn_item_id
WHERE gm.status = 'approved' AND gi.quality_status = 'approved'
GROUP BY gm.id, gm.grn_number, gm.status
HAVING COUNT(wi.id) = 0
LIMIT 5;
