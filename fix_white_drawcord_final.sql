-- Final Fix for White Drawcord Image Issue
-- This script creates the White Drawcord item and fixes image display issues

-- ============================================
-- PART 1: Create White Drawcord Item in item_master
-- ============================================

-- Insert White Drawcord item if it doesn't exist
INSERT INTO public.item_master (
    item_name, 
    item_type, 
    color, 
    image_url,
    uom,
    gst_rate,
    is_active,
    description,
    material,
    size,
    created_at,
    updated_at
) 
SELECT 
    'White Drawcord with Metal Bell',
    'Laces & Drawcords',
    'White',
    'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=200&h=200&fit=crop',
    'pcs',
    18.00,
    true,
    'White drawcord with metal bell for apparel manufacturing',
    'Cotton',
    'Standard',
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM public.item_master 
    WHERE item_name = 'White Drawcord with Metal Bell'
);

-- ============================================
-- PART 2: Update existing purchase order items
-- ============================================

-- Update any existing purchase order items with White Drawcord
UPDATE public.purchase_order_items 
SET 
    item_image_url = 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=200&h=200&fit=crop',
    item_color = 'White',
    item_id = (SELECT id FROM public.item_master WHERE item_name = 'White Drawcord with Metal Bell' LIMIT 1)
WHERE item_name = 'White Drawcord with Metal Bell';

-- ============================================
-- PART 3: Update existing GRN items
-- ============================================

-- Update any existing GRN items with White Drawcord
UPDATE public.grn_items 
SET 
    item_image_url = 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=200&h=200&fit=crop',
    item_color = 'White'
WHERE item_name = 'White Drawcord with Metal Bell';

-- ============================================
-- PART 4: Verification Queries
-- ============================================

-- Verify the item was created/updated
SELECT 'ITEM_MASTER VERIFICATION:' as info;
SELECT 
    id,
    item_name,
    item_type,
    color,
    image_url,
    is_active,
    created_at
FROM public.item_master 
WHERE item_name = 'White Drawcord with Metal Bell';

-- Verify purchase order items
SELECT 'PURCHASE ORDER ITEMS VERIFICATION:' as info;
SELECT 
    id,
    item_name,
    item_type,
    item_color,
    item_image_url,
    item_id
FROM public.purchase_order_items 
WHERE item_name = 'White Drawcord with Metal Bell';

-- Verify GRN items
SELECT 'GRN ITEMS VERIFICATION:' as info;
SELECT 
    id,
    item_name,
    item_type,
    item_color,
    item_image_url
FROM public.grn_items 
WHERE item_name = 'White Drawcord with Metal Bell';

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

SELECT 'White Drawcord image fix completed successfully!' as status;
SELECT 'The item should now display properly in the application.' as details;
SELECT 'If the image URL fails to load, the frontend will show a fallback placeholder.' as note;
