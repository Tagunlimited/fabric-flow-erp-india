-- Fix the missing 'bom_number' column in bom_records table
-- This error occurs when the application tries to insert a bom_number that doesn't exist in the database

-- 1. Check current bom_records table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'bom_records' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Add the missing bom_number column to bom_records table
ALTER TABLE public.bom_records 
ADD COLUMN IF NOT EXISTS bom_number TEXT UNIQUE;

-- 3. Add other potentially missing columns that might be needed
ALTER TABLE public.bom_records 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 4. Create an index on bom_number for better performance
CREATE INDEX IF NOT EXISTS idx_bom_records_bom_number ON public.bom_records(bom_number);

-- 5. Add fabric-specific columns to bom_record_items table (if missing)
ALTER TABLE public.bom_record_items 
ADD COLUMN IF NOT EXISTS fabric_name TEXT,
ADD COLUMN IF NOT EXISTS fabric_color TEXT,
ADD COLUMN IF NOT EXISTS fabric_gsm TEXT,
ADD COLUMN IF NOT EXISTS fabric_id UUID REFERENCES public.fabric_master(id),
ADD COLUMN IF NOT EXISTS item_type TEXT,
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 6. Create indexes for the new fabric columns
CREATE INDEX IF NOT EXISTS idx_bom_record_items_fabric_id ON public.bom_record_items(fabric_id);
CREATE INDEX IF NOT EXISTS idx_bom_record_items_item_type ON public.bom_record_items(item_type);

-- 7. Add a trigger to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_bom_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Create trigger for bom_records updated_at
DROP TRIGGER IF EXISTS trigger_update_bom_records_updated_at ON public.bom_records;
CREATE TRIGGER trigger_update_bom_records_updated_at
    BEFORE UPDATE ON public.bom_records
    FOR EACH ROW EXECUTE FUNCTION update_bom_records_updated_at();

-- 9. Create a function to generate BOM numbers
CREATE OR REPLACE FUNCTION generate_bom_number()
RETURNS TEXT AS $$
DECLARE
    bom_counter INTEGER;
    new_bom_number TEXT;
BEGIN
    -- Get the next counter value
    SELECT COALESCE(MAX(CAST(SUBSTRING(bom_number FROM 'BOM-(\d+)') AS INTEGER)), 0) + 1
    INTO bom_counter
    FROM public.bom_records
    WHERE bom_number ~ '^BOM-\d+$';
    
    -- Generate the new BOM number
    new_bom_number := 'BOM-' || LPAD(bom_counter::TEXT, 6, '0');
    
    RETURN new_bom_number;
END;
$$ LANGUAGE plpgsql;

-- 10. Create a trigger to auto-generate BOM numbers if not provided
CREATE OR REPLACE FUNCTION auto_generate_bom_number()
RETURNS TRIGGER AS $$
BEGIN
    -- Only generate if bom_number is null or empty
    IF NEW.bom_number IS NULL OR NEW.bom_number = '' THEN
        NEW.bom_number := generate_bom_number();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 11. Create trigger for auto-generating BOM numbers
DROP TRIGGER IF EXISTS trigger_auto_generate_bom_number ON public.bom_records;
CREATE TRIGGER trigger_auto_generate_bom_number
    BEFORE INSERT ON public.bom_records
    FOR EACH ROW EXECUTE FUNCTION auto_generate_bom_number();

-- 12. Update existing records to have BOM numbers if they don't have them
UPDATE public.bom_records 
SET bom_number = 'BOM-' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::TEXT, 6, '0')
WHERE bom_number IS NULL OR bom_number = '';

-- 13. Verify the final table structure
SELECT 'Final bom_records table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'bom_records' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 14. Verify the final bom_record_items table structure
SELECT 'Final bom_record_items table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'bom_record_items' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 15. Test the BOM number generation function
SELECT 'Testing BOM number generation:' as info;
SELECT generate_bom_number() as next_bom_number;

-- 16. Show sample existing BOM records
SELECT 'Sample existing BOM records:' as info;
SELECT id, bom_number, product_name, total_order_qty, created_at
FROM public.bom_records
ORDER BY created_at DESC
LIMIT 5;

RAISE NOTICE 'BOM records table has been fixed. The bom_number column and related functionality have been added.';
