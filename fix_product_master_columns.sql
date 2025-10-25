-- Fix product_master table columns to match what the application expects
-- This script ensures the product_master table has the correct column names

-- Check current product_master table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'product_master' 
ORDER BY ordinal_position;

-- Add missing columns if they don't exist
ALTER TABLE product_master 
ADD COLUMN IF NOT EXISTS product_name TEXT,
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Update product_name from name column if it exists
UPDATE product_master 
SET product_name = name 
WHERE product_name IS NULL AND name IS NOT NULL;

-- Create index on product_name for better performance
CREATE INDEX IF NOT EXISTS idx_product_master_product_name ON product_master(product_name);

-- Verify the fix
SELECT 'Updated product_master structure:' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'product_master' 
AND column_name IN ('id', 'name', 'product_name', 'image_url')
ORDER BY column_name;
