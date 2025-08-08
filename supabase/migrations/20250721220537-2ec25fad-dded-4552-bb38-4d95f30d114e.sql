-- Create missing enums and fix customer_types issue
CREATE TYPE customer_type AS ENUM ('Retail', 'Wholesale', 'Corporate', 'B2B', 'B2C', 'Enterprise');

-- Create fabrics table
CREATE TABLE public.fabrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  gsm TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create product_categories table
CREATE TABLE public.product_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_name TEXT NOT NULL,
  description TEXT,
  category_image_url TEXT,
  fabrics TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create size_types table
CREATE TABLE public.size_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  size_name TEXT NOT NULL,
  available_sizes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Update customers table to use proper enum
ALTER TABLE public.customers 
DROP COLUMN IF EXISTS customer_types CASCADE;

ALTER TABLE public.customers 
ADD COLUMN customer_type customer_type DEFAULT 'Retail';

-- Update orders table with new fields
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS sales_manager UUID,
ADD COLUMN IF NOT EXISTS expected_delivery_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS gst_rate NUMERIC DEFAULT 18.00,
ADD COLUMN IF NOT EXISTS gst_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_channel TEXT CHECK (payment_channel IN ('UPI', 'NEFT', 'RTGS', 'Cash')),
ADD COLUMN IF NOT EXISTS reference_id TEXT;

-- Update order_items table with new fields
ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS product_category_id UUID,
ADD COLUMN IF NOT EXISTS category_image_url TEXT,
ADD COLUMN IF NOT EXISTS reference_images TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS mockup_images TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS attachments TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS product_description TEXT,
ADD COLUMN IF NOT EXISTS fabric_id UUID,
ADD COLUMN IF NOT EXISTS gsm TEXT,
ADD COLUMN IF NOT EXISTS color TEXT,
ADD COLUMN IF NOT EXISTS remarks TEXT,
ADD COLUMN IF NOT EXISTS size_type_id UUID,
ADD COLUMN IF NOT EXISTS sizes_quantities JSONB DEFAULT '{}';

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) 
VALUES 
  ('category-images', 'category-images', true),
  ('order-images', 'order-images', true),
  ('order-attachments', 'order-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS for new tables
ALTER TABLE public.fabrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.size_types ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for new tables
CREATE POLICY "Authenticated users can view all fabrics" 
ON public.fabrics FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage fabrics" 
ON public.fabrics FOR ALL USING (true);

CREATE POLICY "Authenticated users can view all product categories" 
ON public.product_categories FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage product categories" 
ON public.product_categories FOR ALL USING (true);

CREATE POLICY "Authenticated users can view all size types" 
ON public.size_types FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage size types" 
ON public.size_types FOR ALL USING (true);

-- Create storage policies
CREATE POLICY "Category images are publicly accessible" 
ON storage.objects FOR SELECT USING (bucket_id = 'category-images');

CREATE POLICY "Users can upload category images" 
ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'category-images');

CREATE POLICY "Users can update category images" 
ON storage.objects FOR UPDATE USING (bucket_id = 'category-images');

CREATE POLICY "Order images are publicly accessible" 
ON storage.objects FOR SELECT USING (bucket_id = 'order-images');

CREATE POLICY "Users can upload order images" 
ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'order-images');

CREATE POLICY "Users can update order images" 
ON storage.objects FOR UPDATE USING (bucket_id = 'order-images');

CREATE POLICY "Users can view their order attachments" 
ON storage.objects FOR SELECT USING (bucket_id = 'order-attachments');

CREATE POLICY "Users can upload order attachments" 
ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'order-attachments');

CREATE POLICY "Users can update order attachments" 
ON storage.objects FOR UPDATE USING (bucket_id = 'order-attachments');

-- Add triggers for updated_at
CREATE TRIGGER update_fabrics_updated_at
BEFORE UPDATE ON public.fabrics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_product_categories_updated_at
BEFORE UPDATE ON public.product_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_size_types_updated_at
BEFORE UPDATE ON public.size_types
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();