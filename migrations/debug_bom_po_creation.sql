-- Debug BOM and Purchase Order creation issues
-- This script helps identify why purchase orders can't be created from BOMs

-- 1. Check all BOM records
SELECT 'All BOM Records:' as info;
SELECT 
  id, 
  bom_number, 
  product_name, 
  total_order_qty, 
  created_at,
  order_id
FROM bom_records 
ORDER BY created_at DESC;

-- 2. Check BOM items for each BOM
SELECT 'BOM Items by BOM:' as info;
SELECT 
  br.bom_number,
  br.product_name,
  bri.item_name,
  bri.category,
  bri.qty_total,
  bri.to_order,
  bri.item_id,
  bri.fabric_name,
  bri.fabric_color,
  bri.fabric_gsm
FROM bom_records br
LEFT JOIN bom_record_items bri ON br.id = bri.bom_id
ORDER BY br.created_at DESC, bri.created_at DESC;

-- 3. Check if any purchase orders exist
SELECT 'All Purchase Orders:' as info;
SELECT 
  id,
  po_number,
  bom_id,
  supplier_id,
  status,
  created_at
FROM purchase_orders 
ORDER BY created_at DESC;

-- 4. Check BOMs that have purchase orders
SELECT 'BOMs with Purchase Orders:' as info;
SELECT 
  br.id as bom_id,
  br.bom_number,
  br.product_name,
  po.id as po_id,
  po.po_number,
  po.status as po_status,
  po.created_at as po_created_at
FROM bom_records br
INNER JOIN purchase_orders po ON br.id = po.bom_id
ORDER BY po.created_at DESC;

-- 5. Check BOMs WITHOUT purchase orders (these should be available for PO creation)
SELECT 'BOMs WITHOUT Purchase Orders (Available for PO creation):' as info;
SELECT 
  br.id as bom_id,
  br.bom_number,
  br.product_name,
  br.total_order_qty,
  br.created_at,
  COUNT(bri.id) as item_count
FROM bom_records br
LEFT JOIN bom_record_items bri ON br.id = bri.bom_id
LEFT JOIN purchase_orders po ON br.id = po.bom_id
WHERE po.id IS NULL
GROUP BY br.id, br.bom_number, br.product_name, br.total_order_qty, br.created_at
ORDER BY br.created_at DESC;

-- 6. Check for any BOMs with empty items (these might cause issues)
SELECT 'BOMs with Empty Items (Potential Issue):' as info;
SELECT 
  br.id as bom_id,
  br.bom_number,
  br.product_name,
  COUNT(bri.id) as item_count
FROM bom_records br
LEFT JOIN bom_record_items bri ON br.id = bri.bom_id
GROUP BY br.id, br.bom_number, br.product_name
HAVING COUNT(bri.id) = 0
ORDER BY br.created_at DESC;
