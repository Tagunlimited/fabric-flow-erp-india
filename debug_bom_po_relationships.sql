-- Debug BOM-PO relationships to find data integrity issues

-- Check all BOMs and their associated POs
SELECT 
  br.id as bom_id,
  br.bom_number,
  br.product_name,
  o.order_number,
  po.id as po_id,
  po.po_number,
  po.created_at as po_created_at
FROM bom_records br
LEFT JOIN orders o ON br.order_id = o.id
LEFT JOIN purchase_orders po ON br.id = po.bom_id
ORDER BY br.created_at DESC;

-- Check for orphaned POs (POs with bom_id that doesn't exist in bom_records)
SELECT 
  'Orphaned POs' as issue_type,
  COUNT(*) as count
FROM purchase_orders po
LEFT JOIN bom_records br ON po.bom_id = br.id
WHERE po.bom_id IS NOT NULL AND br.id IS NULL

UNION ALL

-- Check for POs with NULL bom_id
SELECT 
  'POs with NULL bom_id' as issue_type,
  COUNT(*) as count
FROM purchase_orders 
WHERE bom_id IS NULL

UNION ALL

-- Check for BOMs with multiple POs
SELECT 
  'BOMs with multiple POs' as issue_type,
  COUNT(*) as count
FROM (
  SELECT bom_id, COUNT(*) as po_count
  FROM purchase_orders 
  WHERE bom_id IS NOT NULL
  GROUP BY bom_id
  HAVING COUNT(*) > 1
) multiple_pos;

-- Show specific BOM for order 007
SELECT 
  br.id as bom_id,
  br.bom_number,
  br.product_name,
  o.order_number,
  po.id as po_id,
  po.po_number,
  po.created_at as po_created_at
FROM bom_records br
LEFT JOIN orders o ON br.order_id = o.id
LEFT JOIN purchase_orders po ON br.id = po.bom_id
WHERE o.order_number LIKE '%007%' OR br.bom_number LIKE '%007%'
ORDER BY br.created_at DESC;
