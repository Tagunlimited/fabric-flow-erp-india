-- Database Schema Verification Script
-- Run this in your Supabase SQL Editor to verify and fix schema issues

-- 1. Check fabric_master table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'fabric_master' 
ORDER BY ordinal_position;

-- 2. Check item_master table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'item_master' 
ORDER BY ordinal_position;

-- 3. Add missing columns to fabric_master if they don't exist
DO $$ 
BEGIN
    -- Add gst_rate column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fabric_master' AND column_name = 'gst_rate'
    ) THEN
        ALTER TABLE fabric_master ADD COLUMN gst_rate DECIMAL(5,2) DEFAULT 18.00;
        RAISE NOTICE 'Added gst_rate column to fabric_master';
    END IF;
    
    -- Add image column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fabric_master' AND column_name = 'image'
    ) THEN
        ALTER TABLE fabric_master ADD COLUMN image TEXT;
        RAISE NOTICE 'Added image column to fabric_master';
    END IF;
    
    -- Add color column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fabric_master' AND column_name = 'color'
    ) THEN
        ALTER TABLE fabric_master ADD COLUMN color TEXT;
        RAISE NOTICE 'Added color column to fabric_master';
    END IF;
    
    -- Add gsm column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fabric_master' AND column_name = 'gsm'
    ) THEN
        ALTER TABLE fabric_master ADD COLUMN gsm TEXT;
        RAISE NOTICE 'Added gsm column to fabric_master';
    END IF;
    
    -- Add fabric_description column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fabric_master' AND column_name = 'fabric_description'
    ) THEN
        ALTER TABLE fabric_master ADD COLUMN fabric_description TEXT;
        RAISE NOTICE 'Added fabric_description column to fabric_master';
    END IF;
END $$;

-- 4. Add missing columns to item_master if they don't exist
DO $$ 
BEGIN
    -- Add item_type column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_master' AND column_name = 'item_type'
    ) THEN
        ALTER TABLE item_master ADD COLUMN item_type TEXT;
        RAISE NOTICE 'Added item_type column to item_master';
    END IF;
    
    -- Add image_url column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_master' AND column_name = 'image_url'
    ) THEN
        ALTER TABLE item_master ADD COLUMN image_url TEXT;
        RAISE NOTICE 'Added image_url column to item_master';
    END IF;
    
    -- Add image column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_master' AND column_name = 'image'
    ) THEN
        ALTER TABLE item_master ADD COLUMN image TEXT;
        RAISE NOTICE 'Added image column to item_master';
    END IF;
    
    -- Add gst_rate column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_master' AND column_name = 'gst_rate'
    ) THEN
        ALTER TABLE item_master ADD COLUMN gst_rate DECIMAL(5,2) DEFAULT 18.00;
        RAISE NOTICE 'Added gst_rate column to item_master';
    END IF;
    
    -- Add uom column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_master' AND column_name = 'uom'
    ) THEN
        ALTER TABLE item_master ADD COLUMN uom TEXT DEFAULT 'pcs';
        RAISE NOTICE 'Added uom column to item_master';
    END IF;
END $$;

-- 5. Verify the data in both tables
SELECT 'fabric_master' as table_name, COUNT(*) as total_records,
       COUNT(CASE WHEN color IS NOT NULL AND color != '' THEN 1 END) as with_color,
       COUNT(CASE WHEN gsm IS NOT NULL AND gsm != '' THEN 1 END) as with_gsm,
       COUNT(CASE WHEN image IS NOT NULL AND image != '' THEN 1 END) as with_image
FROM fabric_master
UNION ALL
SELECT 'item_master' as table_name, COUNT(*) as total_records,
       COUNT(CASE WHEN item_type IS NOT NULL AND item_type != '' THEN 1 END) as with_type,
       COUNT(CASE WHEN image_url IS NOT NULL AND image_url != '' THEN 1 END) as with_image_url,
       COUNT(CASE WHEN image IS NOT NULL AND image != '' THEN 1 END) as with_image
FROM item_master;

-- 6. Sample data from fabric_master
SELECT 'Sample fabric_master data:' as info;
SELECT id, fabric_name, color, gsm, image, gst_rate 
FROM fabric_master 
LIMIT 5;

-- 7. Sample data from item_master
SELECT 'Sample item_master data:' as info;
SELECT id, item_name, item_type, image_url, image, gst_rate, uom 
FROM item_master 
LIMIT 5;

-- 8. Success message
SELECT 'Database schema verification completed!' as status;
