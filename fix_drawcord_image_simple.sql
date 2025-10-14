-- Simple fix for White Drawcord image
-- Update the purchase order item with a working image URL

UPDATE public.purchase_order_items 
SET item_image_url = 'https://i.postimg.cc/QxNvKqX5/white-drawcord.jpg'
WHERE item_name = 'White Drawcord with Metal Bell';

-- Also update item_master if it exists
UPDATE public.item_master 
SET image_url = 'https://i.postimg.cc/QxNvKqX5/white-drawcord.jpg'
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
