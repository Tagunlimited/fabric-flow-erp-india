-- Add BOM ID field to purchase_orders table to track which BOMs have purchase orders created
-- Run this in your Supabase SQL Editor

-- 1. Add bom_id column to purchase_orders table
ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS bom_id UUID REFERENCES bom_records(id);

-- 2. Add comments to document the new column
COMMENT ON COLUMN purchase_orders.bom_id IS 'Reference to the BOM that was used to create this purchase order';

-- 3. Create an index for better performance when querying by bom_id
CREATE INDEX IF NOT EXISTS idx_purchase_orders_bom_id ON purchase_orders(bom_id);

-- 4. Verify the changes
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'purchase_orders' 
AND column_name = 'bom_id'
ORDER BY column_name;
