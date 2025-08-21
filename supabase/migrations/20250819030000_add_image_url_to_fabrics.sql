-- Add image_url field to fabrics table
ALTER TABLE public.fabrics 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add image_url field to fabric_variants table
ALTER TABLE public.fabric_variants 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add index for better performance on image_url fields
CREATE INDEX IF NOT EXISTS idx_fabrics_image_url ON public.fabrics(image_url);
CREATE INDEX IF NOT EXISTS idx_fabric_variants_image_url ON public.fabric_variants(image_url);
