-- Backfill warehouse fabric rows whose item_id was not persisted from PO fabric_id.
-- Safe to run multiple times.

UPDATE public.warehouse_inventory wi
SET item_id = poi.fabric_id
FROM public.grn_items gi
JOIN public.purchase_order_items poi ON poi.id = gi.po_item_id
WHERE wi.grn_item_id = gi.id
  AND wi.item_type = 'FABRIC'
  AND poi.fabric_id IS NOT NULL
  AND (
    wi.item_id IS NULL
    OR wi.item_id::text = ''
    OR wi.item_id IS DISTINCT FROM poi.fabric_id
  );
