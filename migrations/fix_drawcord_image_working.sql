-- Fix White Drawcord image using an existing working image URL
-- Let's first see what image URLs are working in your system

SELECT 'WORKING IMAGE URLS FROM YOUR SYSTEM:' as info;
SELECT DISTINCT image_url FROM public.item_master WHERE image_url IS NOT NULL AND image_url != '' LIMIT 5;
SELECT DISTINCT image FROM public.fabric_master WHERE image IS NOT NULL AND image != '' LIMIT 5;

-- Use one of the working image URLs from your system
-- Let's use the Necktape image since we know it's working
UPDATE public.purchase_order_items 
SET item_image_url = 'https://i.postimg.cc/xdbY0wgX/image.png'
WHERE item_name = 'White Drawcord with Metal Bell';

-- Also update item_master if it exists
UPDATE public.item_master 
SET image_url = 'https://i.postimg.cc/xdbY0wgX/image.png'
WHERE item_name ILIKE '%drawcord%' AND item_name ILIKE '%white%';

-- Show the result
SELECT 
    id,
    item_name,
    item_type,
    item_color,
    item_image_url
FROM public.purchase_order_items 
WHERE item_name = 'White Drawcord with Metal Bell';
