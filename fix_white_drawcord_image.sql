-- Fix White Drawcord image issue
-- This script finds and updates the White Drawcord item with the correct image

-- First, let's see what we have for White Drawcord in item_master
SELECT 'ITEM_MASTER - White Drawcord items:' as info;
SELECT id, item_name, color, image_url FROM public.item_master 
WHERE item_name ILIKE '%drawcord%' OR item_name ILIKE '%white%'
ORDER BY item_name;

-- Check current purchase order item
SELECT 'CURRENT PURCHASE ORDER ITEM - White Drawcord:' as info;
SELECT 
    id,
    item_name,
    item_type,
    item_id,
    fabric_color,
    fabric_gsm,
    fabric_name,
    item_color,
    item_image_url
FROM public.purchase_order_items 
WHERE item_name = 'White Drawcord with Metal Bell';

-- Update the item_master with a proper image URL for White Drawcord
UPDATE public.item_master 
SET image_url = 'https://i.postimg.cc/QxNvKqX5/white-drawcord.jpg'
WHERE item_name ILIKE '%drawcord%' AND item_name ILIKE '%white%';

-- Update the purchase order item to use the correct image
UPDATE public.purchase_order_items 
SET 
    item_image_url = 'https://i.postimg.cc/QxNvKqX5/white-drawcord.jpg'
WHERE item_name = 'White Drawcord with Metal Bell';

-- Show results after fix
SELECT 'AFTER FIX - White Drawcord:' as info;
SELECT 
    id,
    item_name,
    item_type,
    item_id,
    fabric_color,
    fabric_gsm,
    fabric_name,
    item_color,
    item_image_url
FROM public.purchase_order_items 
WHERE item_name = 'White Drawcord with Metal Bell';

-- Also check if we need to add a White Drawcord entry to item_master if it doesn't exist
INSERT INTO public.item_master (
    item_name, 
    item_type, 
    color, 
    image_url,
    uom,
    gst_rate
) 
SELECT 
    'White Drawcord with Metal Bell',
    'Laces & Drawcords',
    'White',
    'https://i.postimg.cc/QxNvKqX5/white-drawcord.jpg',
    'pcs',
    18.00
WHERE NOT EXISTS (
    SELECT 1 FROM public.item_master 
    WHERE item_name ILIKE '%drawcord%' AND item_name ILIKE '%white%'
);

-- Update the purchase order item to reference the correct item_master entry
UPDATE public.purchase_order_items 
SET 
    item_id = (SELECT id FROM public.item_master WHERE item_name ILIKE '%drawcord%' AND item_name ILIKE '%white%' LIMIT 1),
    item_image_url = 'https://i.postimg.cc/QxNvKqX5/white-drawcord.jpg'
WHERE item_name = 'White Drawcord with Metal Bell';

-- Final verification
SELECT 'FINAL VERIFICATION:' as info;
SELECT 
    poi.item_name,
    poi.item_type,
    poi.item_color,
    poi.item_image_url,
    im.item_name as master_item_name,
    im.color as master_color,
    im.image_url as master_image_url
FROM public.purchase_order_items poi
LEFT JOIN public.item_master im ON poi.item_id = im.id
WHERE poi.item_name = 'White Drawcord with Metal Bell';
