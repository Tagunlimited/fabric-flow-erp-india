-- Debug Purchase Order List Issues
-- Check if purchase orders have valid supplier data

SELECT 
  po.id,
  po.po_number,
  po.supplier_id,
  po.status,
  po.created_at,
  sm.supplier_name,
  sm.supplier_code
FROM purchase_orders po
LEFT JOIN supplier_master sm ON po.supplier_id = sm.id
WHERE po.bom_id IS NOT NULL
ORDER BY po.created_at DESC;

-- Check if there are any purchase orders without supplier data
SELECT 
  'POs with NULL supplier_id' as issue_type,
  COUNT(*) as count
FROM purchase_orders 
WHERE supplier_id IS NULL

UNION ALL

SELECT 
  'POs with invalid supplier_id' as issue_type,
  COUNT(*) as count
FROM purchase_orders po
LEFT JOIN supplier_master sm ON po.supplier_id = sm.id
WHERE po.supplier_id IS NOT NULL AND sm.id IS NULL

UNION ALL

SELECT 
  'Total POs' as issue_type,
  COUNT(*) as count
FROM purchase_orders;

-- Check purchase order items
SELECT 
  po.po_number,
  COUNT(poi.id) as item_count
FROM purchase_orders po
LEFT JOIN purchase_order_items poi ON po.id = poi.po_id
WHERE po.bom_id IS NOT NULL
GROUP BY po.id, po.po_number
ORDER BY po.created_at DESC;
