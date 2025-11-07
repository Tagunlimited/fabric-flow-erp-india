-- Refresh pending_po_items_view to align with updated bom_record_items schema
-- and hide items that still have stock or active inventory allocations.

CREATE OR REPLACE VIEW pending_po_items_view AS
SELECT
  bri.id AS bom_item_id,
  bri.bom_id,
  br.bom_number,
  br.status AS bom_status,
  br.order_id,
  br.product_name,
  br.product_image_url,
  bri.item_name,
  bri.category AS item_type,
  bri.category,
  bri.qty_total,
  bri.unit_of_measure AS unit,
  bri.to_order,
  bri.stock,
  COALESCE(SUM(bpi.ordered_quantity), 0) AS total_ordered,
  COALESCE(SUM(ia.quantity), 0) AS total_allocated,
  bri.qty_total - COALESCE(SUM(bpi.ordered_quantity), 0) AS remaining_quantity,
  bri.fabric_name,
  bri.fabric_color,
  bri.fabric_gsm,
  bri.item_id,
  bri.item_code,
  bri.item_image_url AS image_url,
  br.created_at AS bom_created_at
FROM bom_record_items bri
JOIN bom_records br ON bri.bom_id = br.id
LEFT JOIN bom_po_items bpi ON bpi.bom_item_id = bri.id
LEFT JOIN inventory_allocations ia ON ia.bom_item_id = bri.id
GROUP BY
  bri.id,
  bri.bom_id,
  br.bom_number,
  br.status,
  br.order_id,
  br.product_name,
  br.product_image_url,
  bri.item_name,
  bri.category,
  bri.qty_total,
  bri.unit_of_measure,
  bri.to_order,
  bri.stock,
  bri.fabric_name,
  bri.fabric_color,
  bri.fabric_gsm,
  bri.item_id,
  bri.item_code,
  bri.item_image_url,
  br.created_at
HAVING
  bri.qty_total - COALESCE(SUM(bpi.ordered_quantity), 0) > 0
  AND COALESCE(SUM(ia.quantity), 0) = 0
  AND COALESCE(bri.stock, 0) <= 0;

GRANT SELECT ON pending_po_items_view TO postgres, anon, authenticated, service_role;

