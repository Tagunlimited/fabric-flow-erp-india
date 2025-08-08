-- Add image columns to order_items table
ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS reference_images TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS mockup_images TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS attachments TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS product_category_id UUID REFERENCES public.product_categories(id),
ADD COLUMN IF NOT EXISTS category_image_url TEXT,
ADD COLUMN IF NOT EXISTS product_description TEXT,
ADD COLUMN IF NOT EXISTS fabric_id UUID REFERENCES public.fabrics(id),
ADD COLUMN IF NOT EXISTS gsm TEXT,
ADD COLUMN IF NOT EXISTS color TEXT,
ADD COLUMN IF NOT EXISTS remarks TEXT,
ADD COLUMN IF NOT EXISTS size_type_id UUID REFERENCES public.size_types(id),
ADD COLUMN IF NOT EXISTS sizes_quantities JSONB DEFAULT '{}';

-- Make product_id nullable since we're now using product_category_id
ALTER TABLE public.order_items 
ALTER COLUMN product_id DROP NOT NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_order_items_category ON public.order_items(product_category_id);
CREATE INDEX IF NOT EXISTS idx_order_items_fabric ON public.order_items(fabric_id);
CREATE INDEX IF NOT EXISTS idx_order_items_size_type ON public.order_items(size_type_id); 