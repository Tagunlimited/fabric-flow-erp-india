-- Migration: Fix Purchase Order Items Table - Add Missing Fabric Detail Columns
-- This migration adds the missing columns to store fabric details in purchase order items

-- Add fabric detail columns to purchase_order_items table
ALTER TABLE public.purchase_order_items 
ADD COLUMN IF NOT EXISTS fabric_color VARCHAR(100),
ADD COLUMN IF NOT EXISTS fabric_gsm VARCHAR(50),
ADD COLUMN IF NOT EXISTS fabric_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS item_color VARCHAR(100),
ADD COLUMN IF NOT EXISTS fabric_id UUID,
ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 18.00;

-- Add comments for documentation
COMMENT ON COLUMN public.purchase_order_items.fabric_color IS 'Color of the fabric item';
COMMENT ON COLUMN public.purchase_order_items.fabric_gsm IS 'GSM (Grams per Square Meter) of the fabric';
COMMENT ON COLUMN public.purchase_order_items.fabric_name IS 'Name of the fabric';
COMMENT ON COLUMN public.purchase_order_items.item_color IS 'Color of the item (for non-fabric items)';
COMMENT ON COLUMN public.purchase_order_items.fabric_id IS 'Reference to fabric_master table';
COMMENT ON COLUMN public.purchase_order_items.gst_rate IS 'GST rate for the item';

-- Create indexes for better performance on fabric-related queries
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_fabric_color ON public.purchase_order_items(fabric_color);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_fabric_name ON public.purchase_order_items(fabric_name);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_item_color ON public.purchase_order_items(item_color);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_fabric_id ON public.purchase_order_items(fabric_id);

-- Update existing records to populate fabric details from related tables
-- This will backfill data for existing purchase order items that might have fabric information
UPDATE public.purchase_order_items 
SET 
  fabric_color = COALESCE(
    (SELECT fm.color FROM public.fabric_master fm WHERE fm.id = purchase_order_items.item_id AND purchase_order_items.item_type = 'fabric'),
    fabric_color
  ),
  fabric_gsm = COALESCE(
    (SELECT fm.gsm FROM public.fabric_master fm WHERE fm.id = purchase_order_items.item_id AND purchase_order_items.item_type = 'fabric'),
    fabric_gsm
  ),
  fabric_name = COALESCE(
    (SELECT fm.fabric_name FROM public.fabric_master fm WHERE fm.id = purchase_order_items.item_id AND purchase_order_items.item_type = 'fabric'),
    fabric_name
  ),
  item_color = COALESCE(
    (SELECT im.color FROM public.item_master im WHERE im.id = purchase_order_items.item_id AND purchase_order_items.item_type != 'fabric'),
    item_color
  ),
  fabric_id = CASE 
    WHEN item_type = 'fabric' THEN item_id 
    ELSE fabric_id 
  END
WHERE purchase_order_items.item_id IS NOT NULL;

-- Success message
SELECT 'Purchase order items fabric detail columns added successfully!' as status;
