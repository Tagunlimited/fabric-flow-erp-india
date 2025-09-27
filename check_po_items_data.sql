-- Check Purchase Order Items Data
-- This will show us what data is in the purchase order items

SELECT 'PURCHASE_ORDER_ITEMS WITH FABRIC DETAILS:' as info;
SELECT 
    poi.id,
    poi.item_name,
    poi.item_type,
    poi.item_id,
    poi.fabric_color,
    poi.fabric_gsm,
    poi.fabric_name,
    poi.item_color,
    poi.item_image_url,
    -- Check if the item_id matches any fabric in fabric_master
    CASE 
        WHEN poi.item_type = 'fabric' THEN 
            (SELECT fm.fabric_name FROM public.fabric_master fm WHERE fm.id = poi.item_id)
        ELSE 'N/A'
    END as fabric_master_name,
    CASE 
        WHEN poi.item_type = 'fabric' THEN 
            (SELECT fm.color FROM public.fabric_master fm WHERE fm.id = poi.item_id)
        ELSE 'N/A'
    END as fabric_master_color,
    CASE 
        WHEN poi.item_type = 'fabric' THEN 
            (SELECT fm.gsm FROM public.fabric_master fm WHERE fm.id = poi.item_id)
        ELSE 'N/A'
    END as fabric_master_gsm
FROM public.purchase_order_items poi
WHERE poi.item_name ILIKE '%lycra%' 
   OR poi.item_name ILIKE '%biowash%'
   OR poi.item_name ILIKE '%drawcord%'
ORDER BY poi.item_name;
