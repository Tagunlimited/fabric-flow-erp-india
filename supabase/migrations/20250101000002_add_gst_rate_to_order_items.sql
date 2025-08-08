-- Add gst_rate column to order_items table
ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS gst_rate NUMERIC DEFAULT 18.00;

-- Create index for gst_rate for better performance
CREATE INDEX IF NOT EXISTS idx_order_items_gst_rate ON public.order_items(gst_rate);
