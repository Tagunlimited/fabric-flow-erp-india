-- Add fabric-specific fields to bom_record_items table
-- This allows storing fabric details separately from item_name

-- Add fabric-specific columns to bom_record_items table
ALTER TABLE public.bom_record_items 
ADD COLUMN IF NOT EXISTS fabric_name text,
ADD COLUMN IF NOT EXISTS fabric_color text,
ADD COLUMN IF NOT EXISTS fabric_gsm text;

-- Add comments for documentation
COMMENT ON COLUMN public.bom_record_items.fabric_name IS 'Name of the fabric (e.g., Cotton, Polyester)';
COMMENT ON COLUMN public.bom_record_items.fabric_color IS 'Color of the fabric';
COMMENT ON COLUMN public.bom_record_items.fabric_gsm IS 'GSM (Grams per Square Meter) of the fabric';

-- Create index for fabric_name for better performance
CREATE INDEX IF NOT EXISTS idx_bom_record_items_fabric_name ON public.bom_record_items(fabric_name);
