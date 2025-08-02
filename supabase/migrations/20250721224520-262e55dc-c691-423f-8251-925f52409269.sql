-- Update product_categories table to support multiple images
ALTER TABLE public.product_categories 
ADD COLUMN category_images JSONB DEFAULT '[]'::jsonb;

-- Update the category_images column to store multiple image types
-- Example structure: [{"type": "front", "url": "...", "alt": "Front view"}, {"type": "back", "url": "...", "alt": "Back view"}]

-- Add index for better performance on category_images
CREATE INDEX idx_product_categories_images ON public.product_categories USING GIN(category_images);

-- Create fabric_variants table to support multiple colors and GSMs per fabric
CREATE TABLE public.fabric_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fabric_id UUID NOT NULL,
  color TEXT NOT NULL,
  gsm TEXT,
  description TEXT,
  stock_quantity NUMERIC DEFAULT 0,
  rate_per_meter NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(fabric_id, color, gsm)
);

-- Enable RLS on fabric_variants
ALTER TABLE public.fabric_variants ENABLE ROW LEVEL SECURITY;

-- Create policies for fabric_variants
CREATE POLICY "Authenticated users can view all fabric variants" 
ON public.fabric_variants 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can manage fabric variants" 
ON public.fabric_variants 
FOR ALL 
USING (true);

-- Create trigger for automatic timestamp updates on fabric_variants
CREATE TRIGGER update_fabric_variants_updated_at
BEFORE UPDATE ON public.fabric_variants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();