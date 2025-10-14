-- ============================================================================
-- FIX: Warehouse Inventory Table Schema Issues
-- Generated: October 8, 2025
-- Description: Fixes the warehouse_inventory table to match application expectations
-- ============================================================================

-- ============================================================================
-- PART 1: DIAGNOSE THE CURRENT STATE
-- ============================================================================

-- Check what columns currently exist in warehouse_inventory table
SELECT 'Current warehouse_inventory table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'warehouse_inventory' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if warehouse_inventory table exists
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'warehouse_inventory' AND table_schema = 'public') 
        THEN '✅ warehouse_inventory table exists'
        ELSE '❌ warehouse_inventory table does not exist'
    END as table_check;

-- ============================================================================
-- PART 2: FIX THE WAREHOUSE_INVENTORY TABLE
-- ============================================================================

-- Create warehouse_inventory table if it doesn't exist
CREATE TABLE IF NOT EXISTS warehouse_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id UUID, -- Will add foreign key constraint after checking if grns table exists
    grn_item_id UUID REFERENCES grn_items(id) ON DELETE CASCADE,
    item_id UUID,
    item_name TEXT NOT NULL,
    item_type TEXT,
    item_image_url TEXT,
    quantity DECIMAL(10,2) NOT NULL,
    unit_of_measure TEXT,
    unit_price DECIMAL(10,2),
    total_value DECIMAL(10,2),
    bin_id UUID REFERENCES bins(id),
    status TEXT DEFAULT 'RECEIVED',
    batch_number TEXT,
    expiry_date DATE,
    received_date TIMESTAMPTZ DEFAULT NOW(),
    received_by UUID REFERENCES auth.users(id),
    -- Fabric-specific columns
    fabric_name TEXT,
    fabric_color TEXT,
    fabric_gsm TEXT,
    item_color TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if the table already exists
ALTER TABLE warehouse_inventory 
ADD COLUMN IF NOT EXISTS grn_id UUID,
ADD COLUMN IF NOT EXISTS grn_item_id UUID REFERENCES grn_items(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS item_id UUID,
ADD COLUMN IF NOT EXISTS item_name TEXT,
ADD COLUMN IF NOT EXISTS item_type TEXT,
ADD COLUMN IF NOT EXISTS item_image_url TEXT,
ADD COLUMN IF NOT EXISTS quantity DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS unit_of_measure TEXT,
ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS total_value DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS bin_id UUID REFERENCES bins(id),
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'RECEIVED',
ADD COLUMN IF NOT EXISTS batch_number TEXT,
ADD COLUMN IF NOT EXISTS expiry_date DATE,
ADD COLUMN IF NOT EXISTS received_date TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES auth.users(id),
-- Fabric-specific columns
ADD COLUMN IF NOT EXISTS fabric_name TEXT,
ADD COLUMN IF NOT EXISTS fabric_color TEXT,
ADD COLUMN IF NOT EXISTS fabric_gsm TEXT,
ADD COLUMN IF NOT EXISTS item_color TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Make item_id nullable to allow fabric items without specific item_id
ALTER TABLE warehouse_inventory ALTER COLUMN item_id DROP NOT NULL;

-- Add foreign key constraint to grns table only if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'grns' AND table_schema = 'public') THEN
        -- Add foreign key constraint to grns table
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'warehouse_inventory' 
              AND tc.constraint_type = 'FOREIGN KEY'
              AND kcu.column_name = 'grn_id'
              AND tc.table_schema = 'public'
        ) THEN
            ALTER TABLE warehouse_inventory ADD CONSTRAINT warehouse_inventory_grn_id_fkey 
            FOREIGN KEY (grn_id) REFERENCES grns(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- ============================================================================
-- PART 3: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_grn_id ON warehouse_inventory(grn_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_grn_item_id ON warehouse_inventory(grn_item_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_item_id ON warehouse_inventory(item_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_bin_id ON warehouse_inventory(bin_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_status ON warehouse_inventory(status);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_item_name ON warehouse_inventory(item_name);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_received_date ON warehouse_inventory(received_date);

-- ============================================================================
-- PART 4: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE warehouse_inventory ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 5: CREATE RLS POLICIES
-- ============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON warehouse_inventory;

-- Create RLS policies for warehouse_inventory table
CREATE POLICY "Allow all operations for authenticated users" ON warehouse_inventory
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- PART 6: CREATE TRIGGERS FOR AUTO TIMESTAMP UPDATE
-- ============================================================================

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_warehouse_inventory_updated_at ON warehouse_inventory;
CREATE TRIGGER update_warehouse_inventory_updated_at
BEFORE UPDATE ON warehouse_inventory
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 7: GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions on tables
GRANT ALL ON warehouse_inventory TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 8: VERIFICATION
-- ============================================================================

SELECT 
    'Warehouse inventory table fixed successfully!' as status,
    'grn_id, grn_item_id, and status columns added' as note;

-- Show final table structure
SELECT 'Final warehouse_inventory table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'warehouse_inventory' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Test the foreign key constraints
SELECT 'Testing foreign key constraints:' as info;
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'grns' AND table_schema = 'public') THEN
            CASE 
                WHEN EXISTS (
                    SELECT 1 FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                    WHERE tc.table_name = 'warehouse_inventory' 
                      AND tc.constraint_type = 'FOREIGN KEY'
                      AND kcu.column_name = 'grn_id'
                      AND tc.table_schema = 'public'
                ) 
                THEN '✅ grn_id foreign key constraint exists'
                ELSE '❌ grn_id foreign key constraint missing'
            END
        ELSE '⚠️ grns table does not exist - grn_id column added without foreign key'
    END as grn_fk_check;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'warehouse_inventory' 
              AND tc.constraint_type = 'FOREIGN KEY'
              AND kcu.column_name = 'grn_item_id'
              AND tc.table_schema = 'public'
        ) 
        THEN '✅ grn_item_id foreign key constraint exists'
        ELSE '❌ grn_item_id foreign key constraint missing'
    END as grn_item_fk_check;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'warehouse_inventory' 
              AND tc.constraint_type = 'FOREIGN KEY'
              AND kcu.column_name = 'bin_id'
              AND tc.table_schema = 'public'
        ) 
        THEN '✅ bin_id foreign key constraint exists'
        ELSE '❌ bin_id foreign key constraint missing'
    END as bin_fk_check;
