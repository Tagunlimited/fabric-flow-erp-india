-- Quick Fix for Fabric Details - Simplified Version
-- Run this if the main migration fails

-- Add columns to grn_items (simplified)
ALTER TABLE public.grn_items 
ADD COLUMN IF NOT EXISTS fabric_color VARCHAR(100),
ADD COLUMN IF NOT EXISTS fabric_gsm VARCHAR(50),
ADD COLUMN IF NOT EXISTS fabric_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS item_color VARCHAR(100);

-- Add columns to purchase_order_items (simplified)
ALTER TABLE public.purchase_order_items 
ADD COLUMN IF NOT EXISTS fabric_color VARCHAR(100),
ADD COLUMN IF NOT EXISTS fabric_gsm VARCHAR(50),
ADD COLUMN IF NOT EXISTS fabric_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS item_color VARCHAR(100),
ADD COLUMN IF NOT EXISTS fabric_id UUID,
ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 18.00;

-- Simple backfill for purchase order items
UPDATE public.purchase_order_items 
SET 
  fabric_color = (SELECT fm.color FROM public.fabric_master fm WHERE fm.id = purchase_order_items.item_id AND purchase_order_items.item_type = 'fabric'),
  fabric_gsm = (SELECT fm.gsm FROM public.fabric_master fm WHERE fm.id = purchase_order_items.item_id AND purchase_order_items.item_type = 'fabric'),
  fabric_name = (SELECT fm.fabric_name FROM public.fabric_master fm WHERE fm.id = purchase_order_items.item_id AND purchase_order_items.item_type = 'fabric'),
  item_color = (SELECT im.color FROM public.item_master im WHERE im.id = purchase_order_items.item_id AND purchase_order_items.item_type != 'fabric'),
  fabric_id = CASE WHEN item_type = 'fabric' THEN item_id ELSE fabric_id END
WHERE item_id IS NOT NULL;

-- Simple backfill for GRN items
UPDATE public.grn_items 
SET 
  fabric_color = (SELECT fm.color FROM public.fabric_master fm WHERE fm.id = grn_items.item_id AND grn_items.item_type = 'fabric'),
  fabric_gsm = (SELECT fm.gsm FROM public.fabric_master fm WHERE fm.id = grn_items.item_id AND grn_items.item_type = 'fabric'),
  fabric_name = (SELECT fm.fabric_name FROM public.fabric_master fm WHERE fm.id = grn_items.item_id AND grn_items.item_type = 'fabric'),
  item_color = (SELECT im.color FROM public.item_master im WHERE im.id = grn_items.item_id AND grn_items.item_type != 'fabric')
WHERE item_id IS NOT NULL;

SELECT 'Quick fix completed!' as status;
