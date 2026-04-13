-- Fix pending_po_items_view: LEFT JOIN bom_po_items + inventory_allocations before GROUP BY
-- multiplied rows so SUM(bpi.ordered_quantity) counted each PO line once per allocation row.
-- Aggregate PO and allocation quantities in derived tables, then join once per bom_item_id.

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
  COALESCE(po_totals.total_ordered, 0) AS total_ordered,
  COALESCE(ia_totals.total_allocated, 0) AS total_allocated,
  bri.qty_total - COALESCE(po_totals.total_ordered, 0) AS remaining_quantity,
  bri.fabric_name,
  bri.fabric_color,
  bri.fabric_gsm,
  bri.fabric_id,
  COALESCE(
    (SELECT fm.fabric_for_supplier FROM public.fabric_master fm WHERE fm.id = bri.fabric_id LIMIT 1),
    (SELECT fm2.fabric_for_supplier
     FROM public.fabric_master fm2
     WHERE fm2.fabric_name = bri.fabric_name
       AND (bri.fabric_color IS NULL OR fm2.color = bri.fabric_color)
       AND (bri.fabric_gsm IS NULL OR fm2.gsm = bri.fabric_gsm)
     LIMIT 1)
  ) AS fabric_for_supplier,
  bri.item_id,
  bri.item_code,
  bri.item_image_url AS image_url,
  br.created_at AS bom_created_at
FROM public.bom_record_items bri
JOIN public.bom_records br ON bri.bom_id = br.id
LEFT JOIN public.orders o ON br.order_id = o.id
LEFT JOIN (
  SELECT bom_item_id, SUM(ordered_quantity) AS total_ordered
  FROM public.bom_po_items
  GROUP BY bom_item_id
) po_totals ON po_totals.bom_item_id = bri.id
LEFT JOIN (
  SELECT bom_item_id, SUM(quantity) AS total_allocated
  FROM public.inventory_allocations
  GROUP BY bom_item_id
) ia_totals ON ia_totals.bom_item_id = bri.id
WHERE
  bri.qty_total - COALESCE(po_totals.total_ordered, 0) > 0
  AND COALESCE(ia_totals.total_allocated, 0) = 0
  AND COALESCE(bri.stock, 0) <= 0;

GRANT SELECT ON public.pending_po_items_view TO postgres, anon, authenticated, service_role;
