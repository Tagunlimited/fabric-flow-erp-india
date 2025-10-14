-- ============================================================================
-- FIX: Order Batch Assignments Table Missing Columns
-- Generated: October 8, 2025
-- Description: Adds missing columns to order_batch_assignments table for batch distribution functionality
-- ============================================================================

-- ============================================================================
-- PART 1: DIAGNOSE THE CURRENT STATE
-- ============================================================================

-- Check current order_batch_assignments table structure
SELECT 'Current order_batch_assignments table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'order_batch_assignments' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if batch assignment columns exist
SELECT 'Checking for batch assignment columns:' as info;
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_batch_assignments' 
              AND column_name = 'assigned_by_id'
              AND table_schema = 'public'
        ) 
        THEN '✅ assigned_by_id exists'
        ELSE '❌ assigned_by_id missing'
    END as assigned_by_id_check;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_batch_assignments' 
              AND column_name = 'assigned_by_name'
              AND table_schema = 'public'
        ) 
        THEN '✅ assigned_by_name exists'
        ELSE '❌ assigned_by_name missing'
    END as assigned_by_name_check;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_batch_assignments' 
              AND column_name = 'assignment_date'
              AND table_schema = 'public'
        ) 
        THEN '✅ assignment_date exists'
        ELSE '❌ assignment_date missing'
    END as assignment_date_check;

-- ============================================================================
-- PART 2: CREATE ORDER_BATCH_ASSIGNMENTS TABLE IF NOT EXISTS
-- ============================================================================

-- Create order_batch_assignments table if it doesn't exist
CREATE TABLE IF NOT EXISTS order_batch_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    assigned_by_id UUID REFERENCES auth.users(id),
    assigned_by_name TEXT,
    assignment_date DATE DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'assigned',
    notes TEXT,
    -- Size-wise quantity assignments
    size_s_quantity INTEGER DEFAULT 0,
    size_m_quantity INTEGER DEFAULT 0,
    size_l_quantity INTEGER DEFAULT 0,
    size_xl_quantity INTEGER DEFAULT 0,
    size_xxl_quantity INTEGER DEFAULT 0,
    size_xxxl_quantity INTEGER DEFAULT 0,
    total_quantity INTEGER DEFAULT 0,
    -- Additional tracking
    priority TEXT DEFAULT 'normal',
    estimated_completion_date DATE,
    actual_completion_date DATE,
    quality_rating DECIMAL(3,2),
    efficiency_rating DECIMAL(3,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 3: ADD MISSING COLUMNS TO EXISTING TABLE
-- ============================================================================

-- Add missing columns if the table already exists
ALTER TABLE order_batch_assignments 
ADD COLUMN IF NOT EXISTS assigned_by_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS assigned_by_name TEXT,
ADD COLUMN IF NOT EXISTS assignment_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'assigned',
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS size_s_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS size_m_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS size_l_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS size_xl_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS size_xxl_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS size_xxxl_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal',
ADD COLUMN IF NOT EXISTS estimated_completion_date DATE,
ADD COLUMN IF NOT EXISTS actual_completion_date DATE,
ADD COLUMN IF NOT EXISTS quality_rating DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS efficiency_rating DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- PART 4: CREATE TRIGGER TO AUTO-POPULATE DATA
-- ============================================================================

-- Function to auto-populate batch assignment data
CREATE OR REPLACE FUNCTION set_order_batch_assignment_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-populate assigned_by_name from assigned_by_id
    IF NEW.assigned_by_name IS NULL AND NEW.assigned_by_id IS NOT NULL THEN
        SELECT COALESCE(
            (SELECT full_name FROM profiles WHERE user_id = NEW.assigned_by_id),
            (SELECT email FROM auth.users WHERE id = NEW.assigned_by_id),
            'Unknown User'
        ) INTO NEW.assigned_by_name;
    END IF;
    
    -- Auto-calculate total_quantity from size quantities
    NEW.total_quantity := COALESCE(NEW.size_s_quantity, 0) + 
                         COALESCE(NEW.size_m_quantity, 0) + 
                         COALESCE(NEW.size_l_quantity, 0) + 
                         COALESCE(NEW.size_xl_quantity, 0) + 
                         COALESCE(NEW.size_xxl_quantity, 0) + 
                         COALESCE(NEW.size_xxxl_quantity, 0);
    
    -- Auto-set assignment_date if not provided
    IF NEW.assignment_date IS NULL THEN
        NEW.assignment_date := CURRENT_DATE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_set_order_batch_assignment_data ON order_batch_assignments;
CREATE TRIGGER trigger_set_order_batch_assignment_data
    BEFORE INSERT OR UPDATE ON order_batch_assignments
    FOR EACH ROW
    EXECUTE FUNCTION set_order_batch_assignment_data();

-- ============================================================================
-- PART 5: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_order_batch_assignments_order_id ON order_batch_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_batch_assignments_batch_id ON order_batch_assignments(batch_id);
CREATE INDEX IF NOT EXISTS idx_order_batch_assignments_assigned_by_id ON order_batch_assignments(assigned_by_id);
CREATE INDEX IF NOT EXISTS idx_order_batch_assignments_assignment_date ON order_batch_assignments(assignment_date);
CREATE INDEX IF NOT EXISTS idx_order_batch_assignments_status ON order_batch_assignments(status);
CREATE INDEX IF NOT EXISTS idx_order_batch_assignments_is_active ON order_batch_assignments(is_active);

-- ============================================================================
-- PART 6: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE order_batch_assignments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for order_batch_assignments
CREATE POLICY "Allow all operations for authenticated users" ON order_batch_assignments
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- PART 7: CREATE TRIGGER FOR AUTO TIMESTAMP UPDATE
-- ============================================================================

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_order_batch_assignments_updated_at ON order_batch_assignments;
CREATE TRIGGER update_order_batch_assignments_updated_at
BEFORE UPDATE ON order_batch_assignments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 8: UPDATE EXISTING RECORDS WITH DEFAULT VALUES
-- ============================================================================

-- Update existing records to have default values for new columns
UPDATE order_batch_assignments 
SET 
    assignment_date = COALESCE(assignment_date, CURRENT_DATE),
    status = COALESCE(status, 'assigned'),
    size_s_quantity = COALESCE(size_s_quantity, 0),
    size_m_quantity = COALESCE(size_m_quantity, 0),
    size_l_quantity = COALESCE(size_l_quantity, 0),
    size_xl_quantity = COALESCE(size_xl_quantity, 0),
    size_xxl_quantity = COALESCE(size_xxl_quantity, 0),
    size_xxxl_quantity = COALESCE(size_xxxl_quantity, 0),
    total_quantity = COALESCE(total_quantity, 0),
    priority = COALESCE(priority, 'normal'),
    is_active = COALESCE(is_active, true)
WHERE 
    assignment_date IS NULL 
    OR status IS NULL
    OR total_quantity IS NULL;

-- ============================================================================
-- PART 9: GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions on tables
GRANT ALL ON order_batch_assignments TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 10: VERIFICATION
-- ============================================================================

SELECT 'Order batch assignments table fixed successfully!' as status;

-- Show updated table structure
SELECT 'Updated order_batch_assignments table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'order_batch_assignments' 
  AND table_schema = 'public'
  AND (column_name LIKE '%assigned%' OR column_name LIKE '%assignment%' OR column_name LIKE '%size%' OR column_name LIKE '%quantity%')
ORDER BY column_name;

-- Test the new columns exist
SELECT 'Verification of batch assignment columns:' as info;
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_batch_assignments' 
              AND column_name = 'assigned_by_id'
              AND table_schema = 'public'
        ) 
        THEN '✅ assigned_by_id column exists'
        ELSE '❌ assigned_by_id column missing'
    END as assigned_by_id_verification;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_batch_assignments' 
              AND column_name = 'assigned_by_name'
              AND table_schema = 'public'
        ) 
        THEN '✅ assigned_by_name column exists'
        ELSE '❌ assigned_by_name column missing'
    END as assigned_by_name_verification;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_batch_assignments' 
              AND column_name = 'assignment_date'
              AND table_schema = 'public'
        ) 
        THEN '✅ assignment_date column exists'
        ELSE '❌ assignment_date column missing'
    END as assignment_date_verification;

-- Show batch assignments summary
SELECT 'Order batch assignments summary:' as info;
SELECT 
    COUNT(*) as total_assignments,
    COUNT(CASE WHEN is_active = true THEN 1 END) as active_assignments,
    COUNT(CASE WHEN status = 'assigned' THEN 1 END) as assigned_orders,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_assignments,
    SUM(total_quantity) as total_pieces_assigned
FROM order_batch_assignments;

-- Show sample batch assignment data
SELECT 'Sample order batch assignment data:' as info;
SELECT 
    id,
    order_id,
    batch_id,
    assigned_by_name,
    assignment_date,
    size_s_quantity,
    size_m_quantity,
    size_l_quantity,
    total_quantity,
    status
FROM order_batch_assignments 
LIMIT 3;
