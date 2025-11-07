-- Adds missing descriptive columns to BOM line items
ALTER TABLE public.bom_record_items
ADD COLUMN IF NOT EXISTS item_image_url TEXT,
ADD COLUMN IF NOT EXISTS fabric_name TEXT,
ADD COLUMN IF NOT EXISTS fabric_color TEXT,
ADD COLUMN IF NOT EXISTS fabric_gsm TEXT;

-- Optional index to improve lookups by fabric attributes
CREATE INDEX IF NOT EXISTS idx_bom_record_items_fabric_details
ON public.bom_record_items (fabric_name, fabric_color, fabric_gsm);

