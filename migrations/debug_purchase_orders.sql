-- Debug Purchase Orders and BOM relationship
SELECT 
  'Purchase Orders' as table_name,
  COUNT(*) as count
FROM purchase_orders
WHERE bom_id IS NOT NULL

UNION ALL

SELECT 
  'All Purchase Orders' as table_name,
  COUNT(*) as count
FROM purchase_orders

UNION ALL

SELECT 
  'BOM Records' as table_name,
  COUNT(*) as count
FROM bom_records;

-- Check specific BOM and its purchase orders
SELECT 
  br.id as bom_id,
  br.bom_number,
  br.product_name,
  po.id as po_id,
  po.po_number,
  po.created_at as po_created_at
FROM bom_records br
LEFT JOIN purchase_orders po ON br.id = po.bom_id
WHERE br.bom_number LIKE '%BOM-1761412452902%'
ORDER BY po.created_at DESC;
