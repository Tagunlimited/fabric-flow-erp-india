-- Add order_type column to orders table to distinguish between custom and readymade orders
-- Default existing orders to 'custom' to maintain backward compatibility

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'custom' CHECK (order_type IN ('custom', 'readymade'));

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_orders_order_type ON public.orders(order_type);

-- Update existing orders to 'custom' if they are null (shouldn't happen due to default, but just in case)
UPDATE public.orders SET order_type = 'custom' WHERE order_type IS NULL;

COMMENT ON COLUMN public.orders.order_type IS 'Type of order: custom (custom-made products) or readymade (pre-made products from product master)';

