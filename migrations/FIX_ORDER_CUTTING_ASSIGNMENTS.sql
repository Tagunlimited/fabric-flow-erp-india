-- ============================================================================
-- FIX: Order Cutting Assignments Table/View Issues
-- Generated: October 8, 2025
-- Description: Fixes the order_cutting_assignments to be a proper table with all required columns
-- ============================================================================

-- ============================================================================
-- PART 1: DIAGNOSE THE CURRENT STATE
-- ============================================================================

-- Check if order_cutting_assignments is a view or table
SELECT 'Checking if order_cutting_assignments is a view or table:' as info;
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.views 
            WHERE table_name = 'order_cutting_assignments' 
              AND table_schema = 'public'
        ) 
        THEN 'VIEW - order_cutting_assignments is a view'
        WHEN EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'order_cutting_assignments' 
              AND table_schema = 'public'
        ) 
        THEN 'TABLE - order_cutting_assignments is a table'
        ELSE 'NOT FOUND - order_cutting_assignments does not exist'
    END as object_type;

-- Check current structure if it exists
SELECT 'Current order_cutting_assignments structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'order_cutting_assignments' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================================================
-- PART 2: DROP EXISTING VIEW/TABLE AND CREATE PROPER TABLE
-- ============================================================================

-- Drop existing view or table
DROP VIEW IF EXISTS order_cutting_assignments CASCADE;
DROP TABLE IF EXISTS order_cutting_assignments CASCADE;

-- Create the proper order_cutting_assignments table
CREATE TABLE order_cutting_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    cutting_master_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    cutting_master_name TEXT NOT NULL,
    cutting_master_avatar_url TEXT,
    assigned_date TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES auth.users(id),
    assigned_by_name TEXT,
    notes TEXT,
    status TEXT DEFAULT 'assigned',
    assigned_quantity INTEGER,
    completed_quantity INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 3: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_order_cutting_assignments_order_id ON order_cutting_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_cutting_assignments_cutting_master_id ON order_cutting_assignments(cutting_master_id);
CREATE INDEX IF NOT EXISTS idx_order_cutting_assignments_assigned_date ON order_cutting_assignments(assigned_date);
CREATE INDEX IF NOT EXISTS idx_order_cutting_assignments_status ON order_cutting_assignments(status);

-- ============================================================================
-- PART 4: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE order_cutting_assignments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 5: CREATE RLS POLICIES
-- ============================================================================

-- Create RLS policies for order_cutting_assignments table
CREATE POLICY "Allow all operations for authenticated users" ON order_cutting_assignments
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- PART 6: CREATE TRIGGERS FOR AUTO TIMESTAMP UPDATE
-- ============================================================================

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_order_cutting_assignments_updated_at ON order_cutting_assignments;
CREATE TRIGGER update_order_cutting_assignments_updated_at
BEFORE UPDATE ON order_cutting_assignments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 7: CREATE TRIGGER TO AUTO-POPULATE ASSIGNED_BY_NAME
-- ============================================================================

-- Function to auto-populate assigned_by_name from assigned_by
CREATE OR REPLACE FUNCTION set_assigned_by_name()
RETURNS TRIGGER AS $$
BEGIN
    -- If assigned_by_name is not provided, try to get it from assigned_by user
    IF NEW.assigned_by_name IS NULL AND NEW.assigned_by IS NOT NULL THEN
        SELECT COALESCE(
            (SELECT full_name FROM profiles WHERE user_id = NEW.assigned_by),
            (SELECT email FROM auth.users WHERE id = NEW.assigned_by),
            'Unknown User'
        ) INTO NEW.assigned_by_name;
    END IF;
    
    -- If cutting_master_name is not provided, try to get it from cutting_master_id
    IF NEW.cutting_master_name IS NULL AND NEW.cutting_master_id IS NOT NULL THEN
        SELECT COALESCE(
            full_name,
            employee_code,
            'Unknown Employee'
        ) INTO NEW.cutting_master_name
        FROM employees 
        WHERE id = NEW.cutting_master_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_set_assigned_by_name ON order_cutting_assignments;
CREATE TRIGGER trigger_set_assigned_by_name
    BEFORE INSERT OR UPDATE ON order_cutting_assignments
    FOR EACH ROW
    EXECUTE FUNCTION set_assigned_by_name();

-- ============================================================================
-- PART 8: GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions on tables
GRANT ALL ON order_cutting_assignments TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 9: VERIFICATION
-- ============================================================================

SELECT 
    'Order cutting assignments table fixed successfully!' as status,
    'Converted from view to proper table with all required columns' as note;

-- Show final table structure
SELECT 'Final order_cutting_assignments table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'order_cutting_assignments' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Test the foreign key constraints
SELECT 'Testing foreign key constraints:' as info;
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'order_cutting_assignments' 
              AND tc.constraint_type = 'FOREIGN KEY'
              AND kcu.column_name = 'order_id'
              AND tc.table_schema = 'public'
        ) 
        THEN '✅ order_id foreign key constraint exists'
        ELSE '❌ order_id foreign key constraint missing'
    END as order_fk_check;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'order_cutting_assignments' 
              AND tc.constraint_type = 'FOREIGN KEY'
              AND kcu.column_name = 'cutting_master_id'
              AND tc.table_schema = 'public'
        ) 
        THEN '✅ cutting_master_id foreign key constraint exists'
        ELSE '❌ cutting_master_id foreign key constraint missing'
    END as cutting_master_fk_check;
