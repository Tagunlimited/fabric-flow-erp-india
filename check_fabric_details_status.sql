-- Check Fabric Details Status
-- Run this in Supabase SQL Editor to verify if fabric detail columns exist

-- Check if GRN items table has fabric detail columns
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'grn_items' 
AND table_schema = 'public'
AND column_name IN ('fabric_color', 'fabric_gsm', 'fabric_name', 'item_color')
ORDER BY column_name;

-- Check if purchase_order_items table has fabric detail columns
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'purchase_order_items' 
AND table_schema = 'public'
AND column_name IN ('fabric_color', 'fabric_gsm', 'fabric_name', 'item_color', 'fabric_id', 'gst_rate')
ORDER BY column_name;

-- Check sample data from fabric_master table
SELECT 
    id,
    fabric_name,
    color,
    gsm,
    image
FROM public.fabric_master 
LIMIT 5;

-- Check sample data from item_master table
SELECT 
    id,
    item_name,
    color,
    image_url
FROM public.item_master 
LIMIT 5;
