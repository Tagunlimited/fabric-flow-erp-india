-- Fix Purchase Order Items Fabric Linking
-- This will populate fabric details by matching fabric names

-- Update purchase order items with fabric data by matching names
UPDATE public.purchase_order_items 
SET 
  fabric_color = (
    SELECT fm.color 
    FROM public.fabric_master fm 
    WHERE LOWER(fm.fabric_name) = LOWER(poi.item_name)
    OR LOWER(fm.fabric_name) LIKE LOWER('%' || poi.item_name || '%')
    LIMIT 1
  ),
  fabric_gsm = (
    SELECT fm.gsm 
    FROM public.fabric_master fm 
    WHERE LOWER(fm.fabric_name) = LOWER(poi.item_name)
    OR LOWER(fm.fabric_name) LIKE LOWER('%' || poi.item_name || '%')
    LIMIT 1
  ),
  fabric_name = (
    SELECT fm.fabric_name 
    FROM public.fabric_master fm 
    WHERE LOWER(fm.fabric_name) = LOWER(poi.item_name)
    OR LOWER(fm.fabric_name) LIKE LOWER('%' || poi.item_name || '%')
    LIMIT 1
  ),
  item_id = (
    SELECT fm.id 
    FROM public.fabric_master fm 
    WHERE LOWER(fm.fabric_name) = LOWER(poi.item_name)
    OR LOWER(fm.fabric_name) LIKE LOWER('%' || poi.item_name || '%')
    LIMIT 1
  ),
  fabric_id = (
    SELECT fm.id 
    FROM public.fabric_master fm 
    WHERE LOWER(fm.fabric_name) = LOWER(poi.item_name)
    OR LOWER(fm.fabric_name) LIKE LOWER('%' || poi.item_name || '%')
    LIMIT 1
  )
FROM public.purchase_order_items poi
WHERE poi.item_type = 'fabric'
AND (poi.fabric_color IS NULL OR poi.item_id IS NULL);

-- Update item_color for non-fabric items from item_master
UPDATE public.purchase_order_items 
SET 
  item_color = (
    SELECT im.color 
    FROM public.item_master im 
    WHERE im.id = poi.item_id
  )
FROM public.purchase_order_items poi
WHERE poi.item_type != 'fabric'
AND poi.item_id IS NOT NULL;

-- Show the results
SELECT 'UPDATED PURCHASE ORDER ITEMS:' as info;
SELECT 
    poi.id,
    poi.item_name,
    poi.item_type,
    poi.item_id,
    poi.fabric_color,
    poi.fabric_gsm,
    poi.fabric_name,
    poi.item_color,
    poi.item_image_url
FROM public.purchase_order_items poi
WHERE poi.item_name ILIKE '%lycra%' 
   OR poi.item_name ILIKE '%biowash%'
   OR poi.item_name ILIKE '%drawcord%'
ORDER BY poi.item_name;
