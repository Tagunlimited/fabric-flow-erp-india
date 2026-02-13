-- Clean up old transporter fields from purchase_orders table
-- This script removes the old detailed transporter fields that are no longer needed

-- Check if old transporter columns exist before removing them
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'purchase_orders' 
AND column_name IN (
    'transporter_name',
    'transporter_phone', 
    'transporter_address',
    'vehicle_number',
    'driver_name',
    'driver_phone'
);

-- Remove old transporter columns if they exist
ALTER TABLE purchase_orders 
DROP COLUMN IF EXISTS transporter_name,
DROP COLUMN IF EXISTS transporter_phone,
DROP COLUMN IF EXISTS transporter_address,
DROP COLUMN IF EXISTS vehicle_number,
DROP COLUMN IF EXISTS driver_name,
DROP COLUMN IF EXISTS driver_phone;

-- Verify the cleanup
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'purchase_orders' 
AND column_name LIKE '%transporter%' OR column_name LIKE '%driver%' OR column_name LIKE '%vehicle%'
ORDER BY column_name;
