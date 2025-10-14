-- Debug Fabric Data - Check what data exists in your tables
-- Run this to see what fabric and item data you have

-- Check all fabrics in fabric_master
SELECT 'FABRIC_MASTER DATA:' as info;
SELECT id, fabric_name, color, gsm, image, type 
FROM public.fabric_master 
ORDER BY fabric_name;

-- Check all items in item_master
SELECT 'ITEM_MASTER DATA:' as info;
SELECT id, item_name, color, image_url, item_type
FROM public.item_master 
ORDER BY item_name;

-- Check purchase order items
SELECT 'PURCHASE_ORDER_ITEMS DATA:' as info;
SELECT poi.id, poi.item_name, poi.item_type, poi.item_id, 
       poi.fabric_color, poi.fabric_gsm, poi.fabric_name, poi.item_color,
       poi.item_image_url
FROM public.purchase_order_items poi
ORDER BY poi.item_name;

-- Check if there are any fabrics with names similar to "Lycra" or "Biowash"
SELECT 'FABRICS SIMILAR TO LYCRA/BIOWASH:' as info;
SELECT id, fabric_name, color, gsm, image 
FROM public.fabric_master 
WHERE fabric_name ILIKE '%lycra%' 
   OR fabric_name ILIKE '%biowash%'
   OR fabric_name ILIKE '%drawcord%';

-- Check if there are any items with names similar to "Lycra" or "Biowash"
SELECT 'ITEMS SIMILAR TO LYCRA/BIOWASH:' as info;
SELECT id, item_name, color, image_url, item_type
FROM public.item_master 
WHERE item_name ILIKE '%lycra%' 
   OR item_name ILIKE '%biowash%'
   OR item_name ILIKE '%drawcord%';
