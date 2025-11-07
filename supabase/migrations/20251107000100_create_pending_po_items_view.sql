-- View: pending_po_items_view
-- Provides aggregated BOM item information including ordered and remaining quantities

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
  COALESCE(bri.item_type, bri.category) AS item_type,
  bri.category,
  bri.qty_total,
  bri.unit,
  bri.to_order,
  bri.stock,
  bri.unit_price,
  bri.total_price,
  COALESCE(SUM(bpi.ordered_quantity), 0) AS total_ordered,
  bri.qty_total - COALESCE(SUM(bpi.ordered_quantity), 0) AS remaining_quantity,
  bri.fabric_name,
  bri.fabric_color,
  bri.fabric_gsm,
  bri.fabric_id,
  bri.item_id,
  bri.item_code,
  bri.image_url,
  bri.notes,
  br.created_at AS bom_created_at
FROM bom_record_items bri
JOIN bom_records br ON bri.bom_id = br.id
LEFT JOIN bom_po_items bpi ON bpi.bom_item_id = bri.id
GROUP BY
  bri.id,
  bri.bom_id,
  br.bom_number,
  br.status,
  br.order_id,
  br.product_name,
  br.product_image_url,
  bri.item_name,
  COALESCE(bri.item_type, bri.category),
  bri.category,
  bri.qty_total,
  bri.unit,
  bri.to_order,
  bri.stock,
  bri.unit_price,
  bri.total_price,
  bri.fabric_name,
  bri.fabric_color,
  bri.fabric_gsm,
  bri.fabric_id,
  bri.item_id,
  bri.item_code,
  bri.image_url,
  bri.notes,
  br.created_at;

GRANT SELECT ON pending_po_items_view TO postgres, anon, authenticated, service_role;

