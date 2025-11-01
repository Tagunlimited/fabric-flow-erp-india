-- Fix purchase order schema - Add all missing columns
-- This script adds all the missing columns for the simplified purchase order form

-- 1. Add transporter fields to purchase_orders table
ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS preferred_transporter TEXT,
ADD COLUMN IF NOT EXISTS transport_remark TEXT;

-- 2. Add remarks column to purchase_order_items table
ALTER TABLE purchase_order_items 
ADD COLUMN IF NOT EXISTS remarks TEXT;

-- 3. Add comments to document the new columns
COMMENT ON COLUMN purchase_orders.preferred_transporter IS 'Preferred transporter name for delivery';
COMMENT ON COLUMN purchase_orders.transport_remark IS 'Transport-related remarks or instructions';
COMMENT ON COLUMN purchase_order_items.remarks IS 'Remarks or notes for the purchase order line item';

-- 4. Remove old detailed transporter columns if they exist (optional cleanup)
ALTER TABLE purchase_orders 
DROP COLUMN IF EXISTS transporter_name,
DROP COLUMN IF EXISTS transporter_phone,
DROP COLUMN IF EXISTS transporter_address,
DROP COLUMN IF EXISTS vehicle_number,
DROP COLUMN IF EXISTS driver_name,
DROP COLUMN IF EXISTS driver_phone;

-- 5. Remove old pricing columns from purchase_order_items if they exist (optional cleanup)
ALTER TABLE purchase_order_items 
DROP COLUMN IF EXISTS unit_price,
DROP COLUMN IF EXISTS total_price,
DROP COLUMN IF EXISTS gst_rate,
DROP COLUMN IF EXISTS gst_amount,
DROP COLUMN IF EXISTS line_total;

-- 6. Verify all changes
-- Check purchase_orders table columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'purchase_orders' 
AND column_name IN ('preferred_transporter', 'transport_remark')
ORDER BY column_name;

-- Check purchase_order_items table columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'purchase_order_items' 
AND column_name = 'remarks'
ORDER BY column_name;
