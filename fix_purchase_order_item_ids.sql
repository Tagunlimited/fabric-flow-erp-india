-- Fix Purchase Order Item IDs
-- This script corrects the item_id and fabric_id in purchase_order_items
-- to match the correct items based on item names

-- First, let's see what we're working with
SELECT 'CURRENT STATE - All items have same item_id:' as info;
SELECT 
    id,
    item_name,
    item_type,
    item_id,
    fabric_id,
    fabric_color,
    fabric_gsm,
    fabric_name,
    item_color,
    item_image_url
FROM public.purchase_order_items 
WHERE item_name IN ('Lycra', 'Biowash', 'White Drawcord with Metal Bell', 'Necktape- Velvet- Red 1"')
ORDER BY item_name;

-- Update Lycra (should be fabric)
UPDATE public.purchase_order_items 
SET 
    item_id = (SELECT id FROM public.fabric_master WHERE fabric_name ILIKE '%lycra%' LIMIT 1),
    fabric_id = (SELECT id FROM public.fabric_master WHERE fabric_name ILIKE '%lycra%' LIMIT 1),
    fabric_color = (SELECT color FROM public.fabric_master WHERE fabric_name ILIKE '%lycra%' LIMIT 1),
    fabric_gsm = (SELECT gsm FROM public.fabric_master WHERE fabric_name ILIKE '%lycra%' LIMIT 1),
    fabric_name = (SELECT fabric_name FROM public.fabric_master WHERE fabric_name ILIKE '%lycra%' LIMIT 1),
    item_color = (SELECT color FROM public.fabric_master WHERE fabric_name ILIKE '%lycra%' LIMIT 1),
    item_image_url = (SELECT image FROM public.fabric_master WHERE fabric_name ILIKE '%lycra%' LIMIT 1)
WHERE item_name = 'Lycra' AND item_type = 'fabric';

-- Update Biowash (should be fabric)
UPDATE public.purchase_order_items 
SET 
    item_id = (SELECT id FROM public.fabric_master WHERE fabric_name ILIKE '%biowash%' LIMIT 1),
    fabric_id = (SELECT id FROM public.fabric_master WHERE fabric_name ILIKE '%biowash%' LIMIT 1),
    fabric_color = (SELECT color FROM public.fabric_master WHERE fabric_name ILIKE '%biowash%' LIMIT 1),
    fabric_gsm = (SELECT gsm FROM public.fabric_master WHERE fabric_name ILIKE '%biowash%' LIMIT 1),
    fabric_name = (SELECT fabric_name FROM public.fabric_master WHERE fabric_name ILIKE '%biowash%' LIMIT 1),
    item_color = (SELECT color FROM public.fabric_master WHERE fabric_name ILIKE '%biowash%' LIMIT 1),
    item_image_url = (SELECT image FROM public.fabric_master WHERE fabric_name ILIKE '%biowash%' LIMIT 1)
WHERE item_name = 'Biowash' AND item_type = 'fabric';

-- Update White Drawcord with Metal Bell (should be item)
UPDATE public.purchase_order_items 
SET 
    item_id = (SELECT id FROM public.item_master WHERE item_name ILIKE '%drawcord%' AND item_name ILIKE '%metal%' LIMIT 1),
    fabric_id = NULL,
    fabric_color = NULL,
    fabric_gsm = NULL,
    fabric_name = NULL,
    item_color = (SELECT color FROM public.item_master WHERE item_name ILIKE '%drawcord%' AND item_name ILIKE '%metal%' LIMIT 1),
    item_image_url = (SELECT image_url FROM public.item_master WHERE item_name ILIKE '%drawcord%' AND item_name ILIKE '%metal%' LIMIT 1)
WHERE item_name = 'White Drawcord with Metal Bell' AND item_type = 'item';

-- Update Necktape- Velvet- Red 1" (should be item)
UPDATE public.purchase_order_items 
SET 
    item_id = (SELECT id FROM public.item_master WHERE item_name ILIKE '%necktape%' AND item_name ILIKE '%velvet%' LIMIT 1),
    fabric_id = NULL,
    fabric_color = NULL,
    fabric_gsm = NULL,
    fabric_name = NULL,
    item_color = (SELECT color FROM public.item_master WHERE item_name ILIKE '%necktape%' AND item_name ILIKE '%velvet%' LIMIT 1),
    item_image_url = (SELECT image_url FROM public.item_master WHERE item_name ILIKE '%necktape%' AND item_name ILIKE '%velvet%' LIMIT 1)
WHERE item_name = 'Necktape- Velvet- Red 1"' AND item_type = 'item';

-- Show the results after update
SELECT 'AFTER UPDATE - Each item has correct item_id:' as info;
SELECT 
    id,
    item_name,
    item_type,
    item_id,
    fabric_id,
    fabric_color,
    fabric_gsm,
    fabric_name,
    item_color,
    item_image_url
FROM public.purchase_order_items 
WHERE item_name IN ('Lycra', 'Biowash', 'White Drawcord with Metal Bell', 'Necktape- Velvet- Red 1"')
ORDER BY item_name;

-- Verify the mappings
SELECT 'VERIFICATION - Item mappings:' as info;
SELECT 
    poi.item_name,
    poi.item_type,
    CASE 
        WHEN poi.item_type = 'fabric' THEN fm.fabric_name
        ELSE im.item_name
    END as mapped_name,
    CASE 
        WHEN poi.item_type = 'fabric' THEN fm.color
        ELSE im.color
    END as mapped_color
FROM public.purchase_order_items poi
LEFT JOIN public.fabric_master fm ON poi.item_id = fm.id AND poi.item_type = 'fabric'
LEFT JOIN public.item_master im ON poi.item_id = im.id AND poi.item_type = 'item'
WHERE poi.item_name IN ('Lycra', 'Biowash', 'White Drawcord with Metal Bell', 'Necktape- Velvet- Red 1"')
ORDER BY poi.item_name;
