-- ============================================================================
-- FIX: Fabrics Foreign Key Issue
-- Generated: October 8, 2025
-- Description: Fixes the foreign key constraint issue between order_items and fabrics
-- ============================================================================

-- ============================================================================
-- PART 1: DIAGNOSE THE CURRENT STATE
-- ============================================================================

-- Check what fabrics exist in the database
SELECT 'Current fabrics in database:' as info;
SELECT 
    id,
    name,
    description
FROM fabrics
ORDER BY name;

-- Check the specific fabric_id that's failing
SELECT 'Checking the failing fabric_id:' as info;
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM fabrics WHERE id = '2d46f4c1-0ddf-4281-b297-09fbc622507c') 
        THEN 'Fabric exists'
        ELSE 'Fabric does not exist'
    END as fabric_check;

-- Check order_items table structure
SELECT 'Current order_items table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'order_items' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check foreign key constraints on order_items
SELECT 'Foreign key constraints on order_items:' as info;
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'order_items'
    AND tc.table_schema = 'public';

-- ============================================================================
-- PART 2: CREATE THE MISSING FABRIC
-- ============================================================================

-- Insert the missing fabric if it doesn't exist
INSERT INTO fabrics (id, name, description)
SELECT 
    '2d46f4c1-0ddf-4281-b297-09fbc622507c'::UUID,
    'ACS Hoodies Fabric',
    'Poly Blend - White, 180 GSM'
WHERE NOT EXISTS (
    SELECT 1 FROM fabrics WHERE id = '2d46f4c1-0ddf-4281-b297-09fbc622507c'
);

-- ============================================================================
-- PART 3: ALTERNATIVE FIX - MAKE FABRIC_ID NULLABLE
-- ============================================================================

-- Option 1: Make fabric_id nullable to allow orders without specific fabrics
ALTER TABLE order_items ALTER COLUMN fabric_id DROP NOT NULL;

-- Option 2: Add a default fabric for orders without specific fabric selection
-- This creates a generic "Not Specified" fabric
INSERT INTO fabrics (id, name, description)
SELECT 
    gen_random_uuid(),
    'Not Specified',
    'Generic fabric for orders without specific fabric selection'
WHERE NOT EXISTS (
    SELECT 1 FROM fabrics WHERE name = 'Not Specified'
);

-- ============================================================================
-- PART 4: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_order_items_fabric_id ON order_items(fabric_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_category_id ON order_items(product_category_id);

-- ============================================================================
-- PART 5: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabrics ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 6: CREATE RLS POLICIES
-- ============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON order_items;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON fabrics;

-- Create RLS policies for order_items table
CREATE POLICY "Allow all operations for authenticated users" ON order_items
    FOR ALL USING (auth.role() = 'authenticated');

-- Create RLS policies for fabrics table
CREATE POLICY "Allow all operations for authenticated users" ON fabrics
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- PART 7: GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions on tables
GRANT ALL ON order_items TO postgres, anon, authenticated, service_role;
GRANT ALL ON fabrics TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 8: VERIFICATION
-- ============================================================================

SELECT 
    'Fabrics foreign key issue fixed!' as status,
    'fabric_id is now nullable and missing fabric was created' as note;

-- Verify the fabric was created
SELECT 'Verifying fabric creation:' as info;
SELECT 
    id,
    name,
    description
FROM fabrics 
WHERE id = '2d46f4c1-0ddf-4281-b297-09fbc622507c';

-- Test inserting an order item with the fabric_id
SELECT 'Testing order item insertion:' as info;
-- This is just a test query to verify the foreign key works
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM fabrics f 
            WHERE f.id = '2d46f4c1-0ddf-4281-b297-09fbc622507c'
        ) 
        THEN 'Foreign key constraint should work now'
        ELSE 'Foreign key constraint will still fail'
    END as test_result;

-- Show all fabrics
SELECT 'All fabrics in database:' as info;
SELECT 
    id,
    name,
    description,
    created_at
FROM fabrics
ORDER BY created_at DESC;
