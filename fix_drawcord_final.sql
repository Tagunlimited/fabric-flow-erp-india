-- Final fix for White Drawcord image
-- Either use a working image or set to null for proper fallback

-- Option 1: Set to null so the fallback "PROD" shows properly
UPDATE public.purchase_order_items 
SET item_image_url = NULL
WHERE item_name = 'White Drawcord with Metal Bell';

-- Option 2: Or use a working image URL from your system
-- UPDATE public.purchase_order_items 
-- SET item_image_url = 'https://i.postimg.cc/xdbY0wgX/image.png'
-- WHERE item_name = 'White Drawcord with Metal Bell';

-- Show the result
SELECT 
    id,
    item_name,
    item_type,
    item_color,
    item_image_url
FROM public.purchase_order_items 
WHERE item_name = 'White Drawcord with Metal Bell';
