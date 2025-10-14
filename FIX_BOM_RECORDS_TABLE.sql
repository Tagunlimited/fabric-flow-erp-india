-- ============================================================================
-- FIX: BOM Records Table Schema Issues
-- Generated: October 8, 2025
-- Description: Fixes the bom_records table to match application expectations
-- ============================================================================

-- ============================================================================
-- PART 1: DIAGNOSE THE CURRENT STATE
-- ============================================================================

-- Check what columns currently exist in bom_records table
SELECT 'Current bom_records table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'bom_records' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if bom_records table exists
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bom_records' AND table_schema = 'public') 
        THEN '✅ bom_records table exists'
        ELSE '❌ bom_records table does not exist'
    END as table_check;

-- ============================================================================
-- PART 2: FIX THE BOM_RECORDS TABLE
-- ============================================================================

-- Create bom_records table if it doesn't exist
CREATE TABLE IF NOT EXISTS bom_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bom_number TEXT UNIQUE,
    product_name TEXT NOT NULL,
    total_order_qty INTEGER NOT NULL,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES order_items(id) ON DELETE CASCADE,
    product_image_url TEXT,
    status TEXT DEFAULT 'draft',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if the table already exists
ALTER TABLE bom_records 
ADD COLUMN IF NOT EXISTS bom_number TEXT,
ADD COLUMN IF NOT EXISTS product_name TEXT,
ADD COLUMN IF NOT EXISTS total_order_qty INTEGER,
ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES order_items(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS product_image_url TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add missing columns to bom_record_items if the table already exists
ALTER TABLE bom_record_items 
ADD COLUMN IF NOT EXISTS fabric_name TEXT,
ADD COLUMN IF NOT EXISTS fabric_color TEXT,
ADD COLUMN IF NOT EXISTS fabric_gsm TEXT;

-- ============================================================================
-- PART 3: CREATE BOM_RECORD_ITEMS TABLE
-- ============================================================================

-- Create bom_record_items table if it doesn't exist
CREATE TABLE IF NOT EXISTS bom_record_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bom_id UUID NOT NULL REFERENCES bom_records(id) ON DELETE CASCADE,
    item_id UUID REFERENCES item_master(id),
    item_code TEXT,
    item_name TEXT,
    category TEXT,
    qty_per_product DECIMAL(10,2),
    qty_total DECIMAL(10,2),
    unit_of_measure TEXT,
    stock DECIMAL(10,2) DEFAULT 0,
    to_order DECIMAL(10,2) DEFAULT 0,
    -- Fabric-specific columns that the application expects
    fabric_name TEXT,
    fabric_color TEXT,
    fabric_gsm TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 4: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_bom_records_bom_number ON bom_records(bom_number);
CREATE INDEX IF NOT EXISTS idx_bom_records_order_id ON bom_records(order_id);
CREATE INDEX IF NOT EXISTS idx_bom_records_status ON bom_records(status);
CREATE INDEX IF NOT EXISTS idx_bom_records_created_by ON bom_records(created_by);

CREATE INDEX IF NOT EXISTS idx_bom_record_items_bom_id ON bom_record_items(bom_id);
CREATE INDEX IF NOT EXISTS idx_bom_record_items_item_id ON bom_record_items(item_id);
CREATE INDEX IF NOT EXISTS idx_bom_record_items_category ON bom_record_items(category);

-- ============================================================================
-- PART 5: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE bom_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_record_items ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 6: CREATE RLS POLICIES
-- ============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON bom_records;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON bom_record_items;

-- Create RLS policies for bom_records table
CREATE POLICY "Allow all operations for authenticated users" ON bom_records
    FOR ALL USING (auth.role() = 'authenticated');

-- Create RLS policies for bom_record_items table
CREATE POLICY "Allow all operations for authenticated users" ON bom_record_items
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- PART 7: CREATE TRIGGERS FOR AUTO TIMESTAMP UPDATE
-- ============================================================================

-- Create the update function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_bom_records_updated_at ON bom_records;
CREATE TRIGGER update_bom_records_updated_at
BEFORE UPDATE ON bom_records
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 8: CREATE BOM NUMBER GENERATION FUNCTION
-- ============================================================================

-- Function to auto-generate BOM numbers
CREATE OR REPLACE FUNCTION generate_bom_number()
RETURNS TEXT AS $$
DECLARE
    new_number TEXT;
    counter INTEGER;
    current_year TEXT;
BEGIN
    -- Get current year
    current_year := EXTRACT(YEAR FROM NOW())::TEXT;
    
    -- Get the next number in sequence for this year
    SELECT COALESCE(MAX(CAST(SUBSTRING(bom_number FROM '[0-9]+$') AS INTEGER)), 0) + 1 
    INTO counter 
    FROM bom_records 
    WHERE bom_number ~ ('^BOM/' || current_year || '/[0-9]+$');
    
    -- Format as BOM/2025/001, BOM/2025/002, etc.
    new_number := 'BOM/' || current_year || '/' || LPAD(counter::TEXT, 3, '0');
    
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to auto-generate BOM number if it's null
CREATE OR REPLACE FUNCTION set_bom_number()
RETURNS TRIGGER AS $$
BEGIN
    -- If bom_number is null or empty, generate one
    IF NEW.bom_number IS NULL OR NEW.bom_number = '' THEN
        NEW.bom_number := generate_bom_number();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_set_bom_number ON bom_records;
CREATE TRIGGER trigger_set_bom_number
    BEFORE INSERT ON bom_records
    FOR EACH ROW
    EXECUTE FUNCTION set_bom_number();

-- ============================================================================
-- PART 9: GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions on tables
GRANT ALL ON bom_records TO postgres, anon, authenticated, service_role;
GRANT ALL ON bom_record_items TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 10: VERIFICATION
-- ============================================================================

SELECT 
    'BOM records table fixed successfully!' as status,
    'bom_number will be auto-generated if not provided' as note;

-- Show final table structure
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

-- Show bom_record_items table structure
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

-- Test the BOM number generation function
SELECT 'Testing BOM number generation:' as info;
SELECT generate_bom_number() as sample_bom_number;
