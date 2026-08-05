-- Cutting modal shows 0 fabric but inventory lists stock (e.g. School Time 6 Kgs vs order Industrial Uniform - M).
-- Run in Supabase SQL editor; replace order_number as needed.

-- A) Fabric on order line(s)
SELECT o.order_number,
       oi.id AS order_item_id,
       oi.quantity,
       fm.id AS order_fabric_id,
       fm.fabric_name,
       fm.color,
       fm.gsm,
       fm.uom,
       fm.fabric_for_supplier
FROM public.orders o
JOIN public.order_items oi ON oi.order_id = o.id
LEFT JOIN public.fabric_master fm ON fm.id = oi.fabric_id
WHERE o.order_number = 'TUC/26-27/441';

-- B) Warehouse fabric rows that might be the same physical stock
SELECT wi.id,
       wi.item_id,
       wi.item_name,
       wi.quantity,
       wi.unit,
       wi.status,
       b.location_type,
       fm.fabric_name AS linked_fm_name,
       fm.fabric_for_supplier AS linked_fm_supplier
FROM public.warehouse_inventory wi
LEFT JOIN public.bins b ON b.id = wi.bin_id
LEFT JOIN public.fabric_master fm ON fm.id = wi.item_id
WHERE wi.item_type = 'FABRIC'
  AND wi.quantity > 0
  AND (
    wi.item_name ILIKE '%School Time%'
    OR fm.fabric_name ILIKE '%School Time%'
    OR fm.fabric_for_supplier ILIKE '%School Time%'
    OR fm.fabric_name ILIKE '%Industrial Uniform%'
    OR wi.item_name ILIKE '%Industrial Uniform%'
  );

-- C) Orphan fabric rows (no item_id) — common cause of inventory vs cutting mismatch
SELECT COUNT(*) AS fabric_rows_missing_item_id
FROM public.warehouse_inventory wi
WHERE wi.item_type = 'FABRIC'
  AND wi.item_id IS NULL
  AND wi.quantity > 0;
