-- Test BOM visibility and data integrity
-- This script checks if BOMs are properly saved and visible

-- 1. Check BOM records
SELECT 'BOM Records:' as info;
SELECT 
  id, 
  bom_number, 
  product_name, 
  total_order_qty, 
  created_at,
  order_id
FROM bom_records 
ORDER BY created_at DESC 
LIMIT 5;

-- 2. Check BOM items
SELECT 'BOM Items:' as info;
SELECT 
  bri.id,
  bri.bom_id,
  bri.item_name,
  bri.category,
  bri.qty_total,
  bri.to_order,
  br.bom_number,
  br.product_name
FROM bom_record_items bri
JOIN bom_records br ON bri.bom_id = br.id
ORDER BY br.created_at DESC, bri.created_at DESC
LIMIT 10;

-- 3. Check if any purchase orders are linked to BOMs
SELECT 'Purchase Orders with BOM links:' as info;
SELECT 
  po.id,
  po.po_number,
  po.bom_id,
  br.bom_number,
  br.product_name,
  po.created_at
FROM purchase_orders po
LEFT JOIN bom_records br ON po.bom_id = br.id
WHERE po.bom_id IS NOT NULL
ORDER BY po.created_at DESC
LIMIT 5;

-- 4. Check recent BOM activity
SELECT 'Recent BOM Activity:' as info;
SELECT 
  br.bom_number,
  br.product_name,
  COUNT(bri.id) as item_count,
  br.created_at
FROM bom_records br
LEFT JOIN bom_record_items bri ON br.id = bri.bom_id
GROUP BY br.id, br.bom_number, br.product_name, br.created_at
ORDER BY br.created_at DESC
LIMIT 5;
