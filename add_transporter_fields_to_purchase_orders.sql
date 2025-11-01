-- Add transporter fields to purchase_orders table
-- This script adds the simplified transporter fields to the purchase_orders table

-- Add the new transporter columns
ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS preferred_transporter TEXT,
ADD COLUMN IF NOT EXISTS transport_remark TEXT;

-- Add comments to document the new columns
COMMENT ON COLUMN purchase_orders.preferred_transporter IS 'Preferred transporter name for delivery';
COMMENT ON COLUMN purchase_orders.transport_remark IS 'Transport-related remarks or instructions';

-- Verify the columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'purchase_orders' 
AND column_name IN ('preferred_transporter', 'transport_remark')
ORDER BY column_name;
