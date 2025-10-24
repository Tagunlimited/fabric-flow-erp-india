-- Add remarks column to purchase_order_items table
-- This script adds the remarks field to the purchase_order_items table for line item remarks

-- Add the remarks column to purchase_order_items table
ALTER TABLE purchase_order_items 
ADD COLUMN IF NOT EXISTS remarks TEXT;

-- Add comment to document the new column
COMMENT ON COLUMN purchase_order_items.remarks IS 'Remarks or notes for the purchase order line item';

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'purchase_order_items' 
AND column_name = 'remarks';
