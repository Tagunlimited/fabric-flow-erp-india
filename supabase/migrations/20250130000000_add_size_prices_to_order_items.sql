-- Add size_prices column to order_items
-- This allows storing individual prices per size (e.g., { "S": 100, "M": 100, "3XL": 120 })
-- Existing orders will have size_prices = NULL and will use the old unit_price calculation

ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS size_prices JSONB;

-- Add comment
COMMENT ON COLUMN order_items.size_prices IS 'Price per size: { "S": 100, "M": 100, "3XL": 120 }. NULL means use old unit_price calculation.';

-- Create index for JSONB queries (optional, for performance)
CREATE INDEX IF NOT EXISTS idx_order_items_size_prices 
ON order_items USING GIN (size_prices);

