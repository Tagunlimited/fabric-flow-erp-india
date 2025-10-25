-- Test BOM data structure to identify issues with PO creation
-- This script checks the specific BOM that was created

-- Check the specific BOM that was created (from the logs)
SELECT 'Specific BOM Record:' as info;
SELECT 
  id, 
  bom_number, 
  product_name, 
  total_order_qty, 
  created_at,
  order_id
FROM bom_records 
WHERE id = '02af6467-460e-4ee8-bc95-b43b87c6420d';

-- Check BOM items for this specific BOM
SELECT 'BOM Items for this BOM:' as info;
SELECT 
  id,
  bom_id,
  item_id,
  item_name,
  category,
  qty_total,
  to_order,
  fabric_name,
  fabric_color,
  fabric_gsm,
  unit_of_measure
FROM bom_record_items 
WHERE bom_id = '02af6467-460e-4ee8-bc95-b43b87c6420d';

-- Check if this BOM has any purchase orders
SELECT 'Purchase Orders for this BOM:' as info;
SELECT 
  id,
  po_number,
  bom_id,
  status,
  created_at
FROM purchase_orders 
WHERE bom_id = '02af6467-460e-4ee8-bc95-b43b87c6420d';

-- Check all BOMs and their PO status
SELECT 'All BOMs with PO Status:' as info;
SELECT 
  br.id,
  br.bom_number,
  br.product_name,
  CASE 
    WHEN po.id IS NOT NULL THEN 'Has PO'
    ELSE 'No PO'
  END as po_status,
  po.po_number,
  po.status as po_status
FROM bom_records br
LEFT JOIN purchase_orders po ON br.id = po.bom_id
ORDER BY br.created_at DESC;
