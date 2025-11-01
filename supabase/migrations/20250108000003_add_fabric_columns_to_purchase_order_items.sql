-- Add fabric-specific columns to purchase_order_items table
-- This migration adds fabric_name, fabric_color, and fabric_gsm columns
-- to properly store fabric details for purchase order items

-- Add fabric-specific columns to purchase_order_items table
ALTER TABLE purchase_order_items 
ADD COLUMN IF NOT EXISTS fabric_name TEXT,
ADD COLUMN IF NOT EXISTS fabric_color TEXT,
ADD COLUMN IF NOT EXISTS fabric_gsm TEXT;

-- Create index for faster fabric lookups
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_fabric 
ON purchase_order_items(fabric_name, fabric_color, fabric_gsm)
WHERE fabric_name IS NOT NULL;

-- Add comments to document the new columns
COMMENT ON COLUMN purchase_order_items.fabric_name IS 'Name of the fabric for fabric-type items';
COMMENT ON COLUMN purchase_order_items.fabric_color IS 'Color of the fabric for fabric-type items';
COMMENT ON COLUMN purchase_order_items.fabric_gsm IS 'GSM (Grams per Square Meter) of the fabric for fabric-type items';
