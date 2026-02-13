-- Backfill Purchase Order Items with Fabric Data
-- This will populate the fabric details in purchase_order_items from fabric_master

-- Update purchase order items with fabric data
UPDATE public.purchase_order_items 
SET 
  fabric_color = (SELECT fm.color FROM public.fabric_master fm WHERE fm.id = purchase_order_items.item_id AND purchase_order_items.item_type = 'fabric'),
  fabric_gsm = (SELECT fm.gsm FROM public.fabric_master fm WHERE fm.id = purchase_order_items.item_id AND purchase_order_items.item_type = 'fabric'),
  fabric_name = (SELECT fm.fabric_name FROM public.fabric_master fm WHERE fm.id = purchase_order_items.item_id AND purchase_order_items.item_type = 'fabric'),
  item_color = (SELECT im.color FROM public.item_master im WHERE im.id = purchase_order_items.item_id AND purchase_order_items.item_type != 'fabric'),
  fabric_id = CASE WHEN item_type = 'fabric' THEN item_id ELSE fabric_id END,
  gst_rate = COALESCE(
    (SELECT fm.gst FROM public.fabric_master fm WHERE fm.id = purchase_order_items.item_id AND purchase_order_items.item_type = 'fabric'),
    (SELECT im.gst_rate FROM public.item_master im WHERE im.id = purchase_order_items.item_id AND purchase_order_items.item_type != 'fabric'),
    18.00
  )
WHERE item_id IS NOT NULL;

-- Show the results
SELECT 
    poi.id,
    poi.item_name,
    poi.item_type,
    poi.fabric_color,
    poi.fabric_gsm,
    poi.fabric_name,
    poi.item_color,
    poi.gst_rate
FROM public.purchase_order_items poi
WHERE poi.item_name ILIKE '%lycra%' 
OR poi.item_name ILIKE '%biowash%'
OR poi.item_name ILIKE '%drawcord%'
ORDER BY poi.item_name;
