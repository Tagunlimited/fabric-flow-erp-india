-- Expose fabric_master link and supplier-facing name on pending PO items for stock resolution & UI.

-- Some environments never received the earlier schema migration that added this column.
ALTER TABLE public.bom_record_items
  ADD COLUMN IF NOT EXISTS fabric_id UUID REFERENCES public.fabric_master(id);

CREATE INDEX IF NOT EXISTS idx_bom_record_items_fabric_id ON public.bom_record_items (fabric_id);

-- REPLACE cannot reorder/rename columns vs the existing view; drop then create.
DROP VIEW IF EXISTS public.pending_po_items_view;

CREATE VIEW public.pending_po_items_view AS
SELECT
  bri.id AS bom_item_id,
  bri.bom_id,
  br.bom_number,
  br.status AS bom_status,
  br.order_id,
  o.order_number,
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
  bri.fabric_id,
  COALESCE(
    (SELECT fm.fabric_for_supplier FROM fabric_master fm WHERE fm.id = bri.fabric_id LIMIT 1),
    (SELECT fm2.fabric_for_supplier
     FROM fabric_master fm2
     WHERE fm2.fabric_name = bri.fabric_name
       AND (bri.fabric_color IS NULL OR fm2.color = bri.fabric_color)
       AND (bri.fabric_gsm IS NULL OR fm2.gsm = bri.fabric_gsm)
     LIMIT 1)
  ) AS fabric_for_supplier,
  bri.item_id,
  bri.item_code,
  bri.item_image_url AS image_url,
  br.created_at AS bom_created_at
FROM bom_record_items bri
JOIN bom_records br ON bri.bom_id = br.id
LEFT JOIN orders o ON br.order_id = o.id
LEFT JOIN bom_po_items bpi ON bpi.bom_item_id = bri.id
LEFT JOIN inventory_allocations ia ON ia.bom_item_id = bri.id
GROUP BY
  bri.id,
  bri.bom_id,
  br.bom_number,
  br.status,
  br.order_id,
  o.order_number,
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
  bri.fabric_id,
  bri.item_id,
  bri.item_code,
  bri.item_image_url,
  br.created_at
HAVING
  bri.qty_total - COALESCE(SUM(bpi.ordered_quantity), 0) > 0
  AND COALESCE(SUM(ia.quantity), 0) = 0
  AND COALESCE(bri.stock, 0) <= 0;

GRANT SELECT ON pending_po_items_view TO postgres, anon, authenticated, service_role;
