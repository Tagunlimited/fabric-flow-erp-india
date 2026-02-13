-- ============================================================================
-- FIX: GRN Items Table Schema Issues
-- Generated: October 8, 2025
-- Description: Fixes the grn_items table to match application expectations
-- ============================================================================

-- ============================================================================
-- PART 1: DIAGNOSE THE CURRENT STATE
-- ============================================================================

-- Check what columns currently exist in grn_items table
SELECT 'Current grn_items table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'grn_items' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if grn_items table exists
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'grn_items' AND table_schema = 'public') 
        THEN '✅ grn_items table exists'
        ELSE '❌ grn_items table does not exist'
    END as table_check;

-- ============================================================================
-- PART 2: FIX THE GRN_ITEMS TABLE
-- ============================================================================

-- Create grn_items table if it doesn't exist
CREATE TABLE IF NOT EXISTS grn_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id UUID NOT NULL REFERENCES grns(id) ON DELETE CASCADE,
    po_item_id UUID REFERENCES purchase_order_items(id),
    item_type TEXT NOT NULL,
    item_id UUID, -- Made nullable to allow fabric items without specific item_id
    item_name TEXT NOT NULL,
    item_image_url TEXT,
    ordered_quantity DECIMAL(10,2) NOT NULL,
    received_quantity DECIMAL(10,2) NOT NULL,
    approved_quantity DECIMAL(10,2) DEFAULT 0,
    rejected_quantity DECIMAL(10,2) DEFAULT 0,
    unit_of_measure TEXT,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    gst_rate DECIMAL(5,2) DEFAULT 0,
    gst_amount DECIMAL(10,2) DEFAULT 0,
    line_total DECIMAL(10,2) NOT NULL,
    quality_status TEXT DEFAULT 'pending',
    batch_number TEXT,
    expiry_date DATE,
    condition_notes TEXT,
    inspection_notes TEXT,
    -- Fabric-specific columns that the application expects
    fabric_name TEXT,
    fabric_color TEXT,
    fabric_gsm TEXT,
    item_color TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if the table already exists
ALTER TABLE grn_items 
ADD COLUMN IF NOT EXISTS grn_id UUID REFERENCES grns(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS po_item_id UUID REFERENCES purchase_order_items(id),
ADD COLUMN IF NOT EXISTS item_type TEXT,
ADD COLUMN IF NOT EXISTS item_id UUID,
ADD COLUMN IF NOT EXISTS item_name TEXT,
ADD COLUMN IF NOT EXISTS item_image_url TEXT,
ADD COLUMN IF NOT EXISTS ordered_quantity DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS received_quantity DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS approved_quantity DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS rejected_quantity DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS unit_of_measure TEXT,
ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS total_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS gst_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS line_total DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS quality_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS batch_number TEXT,
ADD COLUMN IF NOT EXISTS expiry_date DATE,
ADD COLUMN IF NOT EXISTS condition_notes TEXT,
ADD COLUMN IF NOT EXISTS inspection_notes TEXT,
-- Fabric-specific columns
ADD COLUMN IF NOT EXISTS fabric_name TEXT,
ADD COLUMN IF NOT EXISTS fabric_color TEXT,
ADD COLUMN IF NOT EXISTS fabric_gsm TEXT,
ADD COLUMN IF NOT EXISTS item_color TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Make item_id nullable to allow fabric items without specific item_id
ALTER TABLE grn_items ALTER COLUMN item_id DROP NOT NULL;

-- ============================================================================
-- PART 3: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_grn_items_grn_id ON grn_items(grn_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_po_item_id ON grn_items(po_item_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_item_type ON grn_items(item_type);
CREATE INDEX IF NOT EXISTS idx_grn_items_item_id ON grn_items(item_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_quality_status ON grn_items(quality_status);

-- ============================================================================
-- PART 4: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE grn_items ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 5: CREATE RLS POLICIES
-- ============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON grn_items;

-- Create RLS policies for grn_items table
CREATE POLICY "Allow all operations for authenticated users" ON grn_items
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- PART 6: CREATE TRIGGERS FOR AUTO TIMESTAMP UPDATE
-- ============================================================================

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_grn_items_updated_at ON grn_items;
CREATE TRIGGER update_grn_items_updated_at
BEFORE UPDATE ON grn_items
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 7: GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions on tables
GRANT ALL ON grn_items TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 8: VERIFICATION
-- ============================================================================

SELECT 
    'GRN items table fixed successfully!' as status,
    'fabric columns added for fabric-specific GRN items' as note;

-- Show final table structure
SELECT 'Final grn_items table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'grn_items' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Test the foreign key constraints
SELECT 'Testing foreign key constraints:' as info;
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'grn_items' 
              AND tc.constraint_type = 'FOREIGN KEY'
              AND kcu.column_name = 'grn_id'
              AND tc.table_schema = 'public'
        ) 
        THEN '✅ grn_id foreign key constraint exists'
        ELSE '❌ grn_id foreign key constraint missing'
    END as grn_fk_check;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'grn_items' 
              AND tc.constraint_type = 'FOREIGN KEY'
              AND kcu.column_name = 'po_item_id'
              AND tc.table_schema = 'public'
        ) 
        THEN '✅ po_item_id foreign key constraint exists'
        ELSE '❌ po_item_id foreign key constraint missing'
    END as po_item_fk_check;
