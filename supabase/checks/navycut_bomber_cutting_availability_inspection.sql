-- Inspection: cutting modal shows 0 but inventory shows stock (Navycut - Bomber Ivory Yellow 350, etc.)
-- Confirms wi.item_id / poi.fabric_id vs GRN fabric_* fields.

SELECT
  wi.id,
  wi.quantity,
  wi.unit,
  wi.status,
  wi.item_id          AS wi_item_id,
  wi.item_name        AS wi_item_name,
  gi.id               AS grn_item_id,
  gi.item_id          AS gi_item_id,
  gi.fabric_name      AS gi_fabric_name,
  gi.fabric_color     AS gi_fabric_color,
  gi.fabric_gsm       AS gi_fabric_gsm,
  poi.fabric_id       AS poi_fabric_id,
  fm.id               AS resolved_fm_id,
  fm.fabric_name      AS resolved_fm_name,
  fm.color            AS resolved_fm_color,
  fm.gsm              AS resolved_fm_gsm
FROM public.warehouse_inventory wi
LEFT JOIN public.grn_items gi ON gi.id = wi.grn_item_id
LEFT JOIN public.purchase_order_items poi ON poi.id = gi.po_item_id
LEFT JOIN public.fabric_master fm ON fm.id = wi.item_id
WHERE wi.item_type = 'FABRIC'
  AND (
    wi.item_name ILIKE 'Navycut%Bomber%'
    OR gi.fabric_name ILIKE 'Navycut%Bomber%'
  )
  AND wi.status IN ('IN_STORAGE', 'READY_TO_DISPATCH');
