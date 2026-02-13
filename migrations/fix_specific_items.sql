-- Fix specific items in purchase_order_items
-- This script targets the exact items that are showing wrong data

-- First, let's check what we have in fabric_master and item_master
SELECT 'FABRIC_MASTER - Available fabrics:' as info;
SELECT id, fabric_name, color, gsm, image FROM public.fabric_master 
WHERE fabric_name ILIKE '%lycra%' OR fabric_name ILIKE '%biowash%'
ORDER BY fabric_name;

SELECT 'ITEM_MASTER - Available items:' as info;
SELECT id, item_name, color, image_url FROM public.item_master 
WHERE item_name ILIKE '%drawcord%' OR item_name ILIKE '%necktape%'
ORDER BY item_name;

-- Check current state
SELECT 'CURRENT PURCHASE ORDER ITEMS:' as info;
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
WHERE item_name IN ('Lycra', 'Biowash', 'White Drawcord with Metal Bell', 'Necktape- Velvet- Red 1"')
ORDER BY item_name;

-- Fix Biowash (should get its own fabric data, not Lycra's)
UPDATE public.purchase_order_items 
SET 
    item_id = (SELECT id FROM public.fabric_master WHERE fabric_name ILIKE '%biowash%' LIMIT 1),
    fabric_id = (SELECT id FROM public.fabric_master WHERE fabric_name ILIKE '%biowash%' LIMIT 1),
    fabric_color = (SELECT color FROM public.fabric_master WHERE fabric_name ILIKE '%biowash%' LIMIT 1),
    fabric_gsm = (SELECT gsm FROM public.fabric_master WHERE fabric_name ILIKE '%biowash%' LIMIT 1),
    fabric_name = (SELECT fabric_name FROM public.fabric_master WHERE fabric_name ILIKE '%biowash%' LIMIT 1),
    item_color = (SELECT color FROM public.fabric_master WHERE fabric_name ILIKE '%biowash%' LIMIT 1),
    item_image_url = (SELECT image FROM public.fabric_master WHERE fabric_name ILIKE '%biowash%' LIMIT 1)
WHERE item_name = 'Biowash';

-- Fix White Drawcord with Metal Bell (should get item data, not fabric data)
UPDATE public.purchase_order_items 
SET 
    item_id = (SELECT id FROM public.item_master WHERE item_name ILIKE '%drawcord%' LIMIT 1),
    fabric_id = NULL,
    fabric_color = NULL,
    fabric_gsm = NULL,
    fabric_name = NULL,
    item_color = (SELECT color FROM public.item_master WHERE item_name ILIKE '%drawcord%' LIMIT 1),
    item_image_url = (SELECT image_url FROM public.item_master WHERE item_name ILIKE '%drawcord%' LIMIT 1)
WHERE item_name = 'White Drawcord with Metal Bell';

-- Fix Necktape- Velvet- Red 1" (should get item data, not fabric data)
UPDATE public.purchase_order_items 
SET 
    item_id = (SELECT id FROM public.item_master WHERE item_name ILIKE '%necktape%' LIMIT 1),
    fabric_id = NULL,
    fabric_color = NULL,
    fabric_gsm = NULL,
    fabric_name = NULL,
    item_color = (SELECT color FROM public.item_master WHERE item_name ILIKE '%necktape%' LIMIT 1),
    item_image_url = (SELECT image_url FROM public.item_master WHERE item_name ILIKE '%necktape%' LIMIT 1)
WHERE item_name = 'Necktape- Velvet- Red 1"';

-- Show results after fix
SELECT 'AFTER FIX - Purchase Order Items:' as info;
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
WHERE item_name IN ('Lycra', 'Biowash', 'White Drawcord with Metal Bell', 'Necktape- Velvet- Red 1"')
ORDER BY item_name;
