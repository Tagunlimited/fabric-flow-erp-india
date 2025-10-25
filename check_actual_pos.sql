-- Check what's actually in the purchase_orders table
SELECT 
  'All Purchase Orders' as description,
  COUNT(*) as count
FROM purchase_orders

UNION ALL

SELECT 
  'POs with BOM ID' as description,
  COUNT(*) as count
FROM purchase_orders 
WHERE bom_id IS NOT NULL

UNION ALL

SELECT 
  'POs without BOM ID' as description,
  COUNT(*) as count
FROM purchase_orders 
WHERE bom_id IS NULL;

-- Show all purchase orders with their BOM relationships
SELECT 
  po.id as po_id,
  po.po_number,
  po.bom_id,
  po.supplier_id,
  po.status,
  po.created_at,
  br.bom_number,
  br.product_name
FROM purchase_orders po
LEFT JOIN bom_records br ON po.bom_id = br.id
ORDER BY po.created_at DESC
LIMIT 10;
