-- Migration: Fix GRN Items Table - Add Missing Fabric Detail Columns
-- This migration adds the missing columns to store fabric details in GRN items

-- Add fabric detail columns to grn_items table
ALTER TABLE public.grn_items 
ADD COLUMN IF NOT EXISTS fabric_color VARCHAR(100),
ADD COLUMN IF NOT EXISTS fabric_gsm VARCHAR(50),
ADD COLUMN IF NOT EXISTS fabric_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS item_color VARCHAR(100);

-- Add comments for documentation
COMMENT ON COLUMN public.grn_items.fabric_color IS 'Color of the fabric item';
COMMENT ON COLUMN public.grn_items.fabric_gsm IS 'GSM (Grams per Square Meter) of the fabric';
COMMENT ON COLUMN public.grn_items.fabric_name IS 'Name of the fabric';
COMMENT ON COLUMN public.grn_items.item_color IS 'Color of the item (for non-fabric items)';

-- Create indexes for better performance on fabric-related queries
CREATE INDEX IF NOT EXISTS idx_grn_items_fabric_color ON public.grn_items(fabric_color);
CREATE INDEX IF NOT EXISTS idx_grn_items_fabric_name ON public.grn_items(fabric_name);
CREATE INDEX IF NOT EXISTS idx_grn_items_item_color ON public.grn_items(item_color);

-- Update existing records to populate fabric details from related tables
-- This will backfill data for existing GRN items that might have fabric information
UPDATE public.grn_items 
SET 
  fabric_color = COALESCE(
    (SELECT fm.color FROM public.fabric_master fm WHERE fm.id = grn_items.item_id AND grn_items.item_type = 'fabric'),
    fabric_color
  ),
  fabric_gsm = COALESCE(
    (SELECT fm.gsm FROM public.fabric_master fm WHERE fm.id = grn_items.item_id AND grn_items.item_type = 'fabric'),
    fabric_gsm
  ),
  fabric_name = COALESCE(
    (SELECT fm.fabric_name FROM public.fabric_master fm WHERE fm.id = grn_items.item_id AND grn_items.item_type = 'fabric'),
    fabric_name
  ),
  item_color = COALESCE(
    (SELECT im.color FROM public.item_master im WHERE im.id = grn_items.item_id AND grn_items.item_type != 'fabric'),
    item_color
  )
WHERE grn_items.item_id IS NOT NULL;

-- Success message
SELECT 'GRN items fabric detail columns added successfully!' as status;
