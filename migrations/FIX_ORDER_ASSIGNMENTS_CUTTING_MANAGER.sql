-- ============================================================================
-- FIX: Order Assignments Cutting Manager Columns
-- Generated: October 8, 2025
-- Description: Adds missing columns to order_assignments table for cutting manager functionality
-- ============================================================================

-- ============================================================================
-- PART 1: DIAGNOSE THE CURRENT STATE
-- ============================================================================

-- Check current order_assignments table structure
SELECT 'Current order_assignments table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'order_assignments' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if cutting manager columns exist
SELECT 'Checking for cutting manager columns:' as info;
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_assignments' 
              AND column_name = 'cutting_master_id'
              AND table_schema = 'public'
        ) 
        THEN '✅ cutting_master_id exists'
        ELSE '❌ cutting_master_id missing'
    END as cutting_master_id_check;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_assignments' 
              AND column_name = 'cutting_master_name'
              AND table_schema = 'public'
        ) 
        THEN '✅ cutting_master_name exists'
        ELSE '❌ cutting_master_name missing'
    END as cutting_master_name_check;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_assignments' 
              AND column_name = 'pattern_master_name'
              AND table_schema = 'public'
        ) 
        THEN '✅ pattern_master_name exists'
        ELSE '❌ pattern_master_name missing'
    END as pattern_master_name_check;

-- ============================================================================
-- PART 2: ADD MISSING CUTTING MANAGER COLUMNS
-- ============================================================================

-- Add missing cutting manager columns to order_assignments table
ALTER TABLE order_assignments 
ADD COLUMN IF NOT EXISTS cutting_master_id UUID REFERENCES employees(id),
ADD COLUMN IF NOT EXISTS cutting_master_name TEXT,
ADD COLUMN IF NOT EXISTS cutting_master_avatar_url TEXT,
ADD COLUMN IF NOT EXISTS pattern_master_id UUID REFERENCES employees(id),
ADD COLUMN IF NOT EXISTS pattern_master_name TEXT,
ADD COLUMN IF NOT EXISTS pattern_master_avatar_url TEXT,
ADD COLUMN IF NOT EXISTS cutting_work_date DATE,
ADD COLUMN IF NOT EXISTS cut_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cut_quantities_by_size JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS cutting_start_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cutting_end_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cutting_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS cutting_notes TEXT,
ADD COLUMN IF NOT EXISTS fabric_consumption DECIMAL(10,3),
ADD COLUMN IF NOT EXISTS cutting_efficiency DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS defects_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rework_required BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS quality_rating DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS cutting_pattern TEXT,
ADD COLUMN IF NOT EXISTS estimated_hours DECIMAL(8,2),
ADD COLUMN IF NOT EXISTS actual_hours DECIMAL(8,2);

-- ============================================================================
-- PART 3: CREATE TRIGGER TO AUTO-POPULATE CUTTING MASTER NAME
-- ============================================================================

-- Function to auto-populate cutting master name from cutting master id
CREATE OR REPLACE FUNCTION set_cutting_master_names()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-populate cutting_master_name from cutting_master_id
    IF NEW.cutting_master_name IS NULL AND NEW.cutting_master_id IS NOT NULL THEN
        SELECT COALESCE(
            full_name,
            employee_code,
            'Unknown Cutting Master'
        ) INTO NEW.cutting_master_name
        FROM employees 
        WHERE id = NEW.cutting_master_id;
    END IF;
    
    -- Auto-populate pattern_master_name from pattern_master_id
    IF NEW.pattern_master_name IS NULL AND NEW.pattern_master_id IS NOT NULL THEN
        SELECT COALESCE(
            full_name,
            employee_code,
            'Unknown Pattern Master'
        ) INTO NEW.pattern_master_name
        FROM employees 
        WHERE id = NEW.pattern_master_id;
    END IF;
    
    -- Auto-populate cutting_work_date if not set
    IF NEW.cutting_work_date IS NULL AND NEW.cutting_start_date IS NOT NULL THEN
        NEW.cutting_work_date := NEW.cutting_start_date::date;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_set_cutting_master_names ON order_assignments;
CREATE TRIGGER trigger_set_cutting_master_names
    BEFORE INSERT OR UPDATE ON order_assignments
    FOR EACH ROW
    EXECUTE FUNCTION set_cutting_master_names();

-- ============================================================================
-- PART 4: CREATE INDEXES FOR NEW COLUMNS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_order_assignments_cutting_master_id ON order_assignments(cutting_master_id);
CREATE INDEX IF NOT EXISTS idx_order_assignments_pattern_master_id ON order_assignments(pattern_master_id);
CREATE INDEX IF NOT EXISTS idx_order_assignments_cutting_work_date ON order_assignments(cutting_work_date);
CREATE INDEX IF NOT EXISTS idx_order_assignments_cutting_status ON order_assignments(cutting_status);
CREATE INDEX IF NOT EXISTS idx_order_assignments_cutting_start_date ON order_assignments(cutting_start_date);

-- ============================================================================
-- PART 5: UPDATE EXISTING RECORDS WITH DEFAULT VALUES
-- ============================================================================

-- Update existing records to have default values for new columns
UPDATE order_assignments 
SET 
    cut_quantity = COALESCE(cut_quantity, 0),
    cut_quantities_by_size = COALESCE(cut_quantities_by_size, '{}'::jsonb),
    cutting_status = COALESCE(cutting_status, 'pending'),
    defects_count = COALESCE(defects_count, 0),
    rework_required = COALESCE(rework_required, false),
    estimated_hours = COALESCE(estimated_hours, 0),
    actual_hours = COALESCE(actual_hours, 0),
    fabric_consumption = COALESCE(fabric_consumption, 0),
    cutting_efficiency = COALESCE(cutting_efficiency, 0)
WHERE 
    cut_quantity IS NULL 
    OR cut_quantities_by_size IS NULL
    OR cutting_status IS NULL;

-- ============================================================================
-- PART 6: UPDATE EXISTING ASSIGNMENTS WITH CUTTING MASTER DATA
-- ============================================================================

-- Update existing order_assignments to add cutting master data where missing
UPDATE order_assignments 
SET 
    cutting_master_id = (
        SELECT e.id 
        FROM employees e 
        WHERE (e.department = 'Cutting' OR e.designation = 'Cutting Master')
        LIMIT 1
    ),
    cutting_master_name = (
        SELECT e.full_name 
        FROM employees e 
        WHERE (e.department = 'Cutting' OR e.designation = 'Cutting Master')
        LIMIT 1
    ),
    cutting_work_date = COALESCE(cutting_work_date, CURRENT_DATE + INTERVAL '1 day'),
    cut_quantity = COALESCE(cut_quantity, 10),
    cutting_status = COALESCE(cutting_status, 'pending'),
    cutting_notes = COALESCE(cutting_notes, 'Ready for cutting'),
    fabric_consumption = COALESCE(fabric_consumption, 0.0),
    cutting_efficiency = COALESCE(cutting_efficiency, 0.0)
WHERE cutting_master_id IS NULL
  AND EXISTS (
      SELECT 1 FROM employees e 
      WHERE (e.department = 'Cutting' OR e.designation = 'Cutting Master')
  );

-- ============================================================================
-- PART 7: VERIFICATION
-- ============================================================================

SELECT 'Order assignments cutting manager columns added successfully!' as status;

-- Show updated table structure
SELECT 'Updated order_assignments table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'order_assignments' 
  AND table_schema = 'public'
  AND (column_name LIKE '%cutting%' OR column_name LIKE '%pattern%')
ORDER BY column_name;

-- Test the new columns exist
SELECT 'Verification of cutting manager columns:' as info;
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_assignments' 
              AND column_name = 'cutting_master_id'
              AND table_schema = 'public'
        ) 
        THEN '✅ cutting_master_id column exists'
        ELSE '❌ cutting_master_id column missing'
    END as cutting_master_id_verification;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_assignments' 
              AND column_name = 'cutting_master_name'
              AND table_schema = 'public'
        ) 
        THEN '✅ cutting_master_name column exists'
        ELSE '❌ cutting_master_name column missing'
    END as cutting_master_name_verification;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_assignments' 
              AND column_name = 'pattern_master_name'
              AND table_schema = 'public'
        ) 
        THEN '✅ pattern_master_name column exists'
        ELSE '❌ pattern_master_name column missing'
    END as pattern_master_name_verification;

-- Show cutting assignments count
SELECT 'Cutting assignments summary:' as info;
SELECT 
    COUNT(*) as total_assignments,
    COUNT(cutting_master_id) as assignments_with_cutting_master,
    COUNT(pattern_master_id) as assignments_with_pattern_master,
    COUNT(CASE WHEN cutting_status = 'pending' THEN 1 END) as pending_jobs,
    COUNT(CASE WHEN cutting_status = 'in_progress' THEN 1 END) as in_progress_jobs,
    COUNT(CASE WHEN cutting_status = 'completed' THEN 1 END) as completed_jobs
FROM order_assignments;

-- Show sample cutting assignment data
SELECT 'Sample cutting assignment data:' as info;
SELECT 
    id,
    order_id,
    cutting_master_name,
    pattern_master_name,
    cutting_work_date,
    cut_quantity,
    cutting_status,
    cutting_notes
FROM order_assignments 
WHERE cutting_master_id IS NOT NULL
LIMIT 3;
