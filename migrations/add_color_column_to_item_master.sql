-- Add color column to item_master table
-- Run this in your Supabase SQL Editor

-- Add color column to item_master if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_master' AND column_name = 'color'
    ) THEN
        ALTER TABLE public.item_master ADD COLUMN color VARCHAR(100);
        RAISE NOTICE 'Added color column to item_master';
    ELSE
        RAISE NOTICE 'Color column already exists in item_master';
    END IF;
END $$;

-- Add color column to fabric_master if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fabric_master' AND column_name = 'color'
    ) THEN
        ALTER TABLE public.fabric_master ADD COLUMN color VARCHAR(100);
        RAISE NOTICE 'Added color column to fabric_master';
    ELSE
        RAISE NOTICE 'Color column already exists in fabric_master';
    END IF;
END $$;

-- Update existing records to have default color if null
UPDATE public.item_master SET color = 'N/A' WHERE color IS NULL;
UPDATE public.fabric_master SET color = 'N/A' WHERE color IS NULL;

-- Add comments
COMMENT ON COLUMN public.item_master.color IS 'Color of the item';
COMMENT ON COLUMN public.fabric_master.color IS 'Color of the fabric';

SELECT 'Color columns added successfully to item_master and fabric_master!' as status;
