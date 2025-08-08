-- Make product_id nullable in order_items table since we're using product_category_id instead
ALTER TABLE public.order_items ALTER COLUMN product_id DROP NOT NULL;