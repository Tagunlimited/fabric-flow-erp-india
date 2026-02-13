-- ============================================================================
-- FIX: Purchase Order Items Table Schema Issues
-- Generated: October 8, 2025
-- Description: Fixes the purchase_order_items table to match application expectations
-- ============================================================================

-- ============================================================================
-- PART 1: DIAGNOSE THE CURRENT STATE
-- ============================================================================

-- Check what columns currently exist in purchase_order_items table
SELECT 'Current purchase_order_items table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'purchase_order_items' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if purchase_order_items table exists
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_order_items' AND table_schema = 'public') 
        THEN '✅ purchase_order_items table exists'
        ELSE '❌ purchase_order_items table does not exist'
    END as table_check;

-- ============================================================================
-- PART 2: FIX THE PURCHASE_ORDER_ITEMS TABLE
-- ============================================================================

-- Create purchase_order_items table if it doesn't exist
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL,
    item_id UUID,
    item_name TEXT NOT NULL,
    item_image_url TEXT,
    quantity DECIMAL(10,2) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    gst_rate DECIMAL(5,2) DEFAULT 0,
    gst_amount DECIMAL(10,2) DEFAULT 0,
    line_total DECIMAL(10,2) NOT NULL,
    unit_of_measure TEXT,
    notes TEXT,
    -- Fabric-specific columns that the application expects
    fabric_name TEXT,
    fabric_color TEXT,
    fabric_gsm TEXT,
    fabric_id UUID REFERENCES fabrics(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if the table already exists
ALTER TABLE purchase_order_items 
ADD COLUMN IF NOT EXISTS item_type TEXT,
ADD COLUMN IF NOT EXISTS item_id UUID,
ADD COLUMN IF NOT EXISTS item_name TEXT,
ADD COLUMN IF NOT EXISTS item_image_url TEXT,
ADD COLUMN IF NOT EXISTS quantity DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS total_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS gst_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS line_total DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS unit_of_measure TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT,
-- Fabric-specific columns
ADD COLUMN IF NOT EXISTS fabric_name TEXT,
ADD COLUMN IF NOT EXISTS fabric_color TEXT,
ADD COLUMN IF NOT EXISTS fabric_gsm TEXT,
ADD COLUMN IF NOT EXISTS fabric_id UUID REFERENCES fabrics(id),
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- PART 3: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_item_type ON purchase_order_items(item_type);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_item_id ON purchase_order_items(item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_fabric_id ON purchase_order_items(fabric_id);

-- ============================================================================
-- PART 4: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 5: CREATE RLS POLICIES
-- ============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON purchase_order_items;

-- Create RLS policies for purchase_order_items table
CREATE POLICY "Allow all operations for authenticated users" ON purchase_order_items
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- PART 6: CREATE TRIGGERS FOR AUTO TIMESTAMP UPDATE
-- ============================================================================

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_purchase_order_items_updated_at ON purchase_order_items;
CREATE TRIGGER update_purchase_order_items_updated_at
BEFORE UPDATE ON purchase_order_items
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 7: GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions on tables
GRANT ALL ON purchase_order_items TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 8: VERIFICATION
-- ============================================================================

SELECT 
    'Purchase order items table fixed successfully!' as status,
    'fabric columns added for fabric-specific purchase orders' as note;

-- Show final table structure
SELECT 'Final purchase_order_items table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'purchase_order_items' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Test the foreign key constraint to fabrics table
SELECT 'Testing fabric_id foreign key:' as info;
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'purchase_order_items' 
              AND tc.constraint_type = 'FOREIGN KEY'
              AND kcu.column_name = 'fabric_id'
              AND tc.table_schema = 'public'
        ) 
        THEN '✅ fabric_id foreign key constraint exists'
        ELSE '❌ fabric_id foreign key constraint missing'
    END as foreign_key_check;
