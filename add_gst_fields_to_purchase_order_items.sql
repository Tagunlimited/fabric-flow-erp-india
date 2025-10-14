-- Add GST-related fields to purchase_order_items table
-- Run this in your Supabase SQL Editor

-- Add GST fields to purchase_order_items table
ALTER TABLE purchase_order_items 
ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 18.00,
ADD COLUMN IF NOT EXISTS gst_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS line_total DECIMAL(15,2) DEFAULT 0;

-- Update existing records to calculate GST amounts and line totals
UPDATE purchase_order_items 
SET 
    gst_amount = (quantity * unit_price * gst_rate / 100),
    line_total = (quantity * unit_price) + (quantity * unit_price * gst_rate / 100)
WHERE gst_amount = 0 AND line_total = 0;

-- Add comments for documentation
COMMENT ON COLUMN purchase_order_items.gst_rate IS 'GST rate percentage (e.g., 18.00 for 18%)';
COMMENT ON COLUMN purchase_order_items.gst_amount IS 'Calculated GST amount for this line item';
COMMENT ON COLUMN purchase_order_items.line_total IS 'Total amount including GST for this line item';
