-- ============================================================================
-- FIX: Batches Table Missing Columns
-- Generated: October 8, 2025
-- Description: Adds missing columns to batches table for tailor management functionality
-- ============================================================================

-- ============================================================================
-- PART 1: DIAGNOSE THE CURRENT STATE
-- ============================================================================

-- Check current batches table structure
SELECT 'Current batches table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'batches' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if tailor management columns exist
SELECT 'Checking for tailor management columns:' as info;
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'batches' 
              AND column_name = 'tailor_type'
              AND table_schema = 'public'
        ) 
        THEN '✅ tailor_type exists'
        ELSE '❌ tailor_type missing'
    END as tailor_type_check;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'batches' 
              AND column_name = 'current_capacity'
              AND table_schema = 'public'
        ) 
        THEN '✅ current_capacity exists'
        ELSE '❌ current_capacity missing'
    END as current_capacity_check;

-- ============================================================================
-- PART 2: ADD MISSING TAILOR MANAGEMENT COLUMNS
-- ============================================================================

-- Add missing tailor management columns to batches table
ALTER TABLE batches 
ADD COLUMN IF NOT EXISTS tailor_type TEXT DEFAULT 'general',
ADD COLUMN IF NOT EXISTS current_capacity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS batch_leader_id UUID REFERENCES employees(id),
ADD COLUMN IF NOT EXISTS batch_leader_name TEXT,
ADD COLUMN IF NOT EXISTS batch_leader_avatar_url TEXT,
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS department TEXT,
ADD COLUMN IF NOT EXISTS specialization TEXT,
ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS efficiency_rating DECIMAL(3,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS quality_rating DECIMAL(3,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS end_date DATE,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS created_by_name TEXT,
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS updated_by_name TEXT;

-- ============================================================================
-- PART 3: CREATE TRIGGER TO AUTO-POPULATE BATCH LEADER NAME
-- ============================================================================

-- Function to auto-populate batch leader name from batch leader id
CREATE OR REPLACE FUNCTION set_batch_leader_name()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-populate batch_leader_name from batch_leader_id
    IF NEW.batch_leader_name IS NULL AND NEW.batch_leader_id IS NOT NULL THEN
        SELECT COALESCE(
            full_name,
            employee_code,
            'Unknown Batch Leader'
        ) INTO NEW.batch_leader_name
        FROM employees 
        WHERE id = NEW.batch_leader_id;
    END IF;
    
    -- Auto-populate created_by_name from created_by
    IF NEW.created_by_name IS NULL AND NEW.created_by IS NOT NULL THEN
        SELECT COALESCE(
            (SELECT full_name FROM profiles WHERE user_id = NEW.created_by),
            (SELECT email FROM auth.users WHERE id = NEW.created_by),
            'Unknown User'
        ) INTO NEW.created_by_name;
    END IF;
    
    -- Auto-populate updated_by_name from updated_by
    IF NEW.updated_by_name IS NULL AND NEW.updated_by IS NOT NULL THEN
        SELECT COALESCE(
            (SELECT full_name FROM profiles WHERE user_id = NEW.updated_by),
            (SELECT email FROM auth.users WHERE id = NEW.updated_by),
            'Unknown User'
        ) INTO NEW.updated_by_name;
    END IF;
    
    -- Auto-calculate current_capacity based on assigned tailors
    IF NEW.current_capacity IS NULL OR NEW.current_capacity = 0 THEN
        SELECT COUNT(*) INTO NEW.current_capacity
        FROM batch_assignments ba
        WHERE ba.batch_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_set_batch_leader_name ON batches;
CREATE TRIGGER trigger_set_batch_leader_name
    BEFORE INSERT OR UPDATE ON batches
    FOR EACH ROW
    EXECUTE FUNCTION set_batch_leader_name();

-- ============================================================================
-- PART 4: CREATE INDEXES FOR NEW COLUMNS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_batches_tailor_type ON batches(tailor_type);
CREATE INDEX IF NOT EXISTS idx_batches_current_capacity ON batches(current_capacity);
CREATE INDEX IF NOT EXISTS idx_batches_batch_leader_id ON batches(batch_leader_id);
CREATE INDEX IF NOT EXISTS idx_batches_is_active ON batches(is_active);
CREATE INDEX IF NOT EXISTS idx_batches_department ON batches(department);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);

-- ============================================================================
-- PART 5: UPDATE EXISTING RECORDS WITH DEFAULT VALUES
-- ============================================================================

-- Update existing records to have default values for new columns
UPDATE batches 
SET 
    tailor_type = COALESCE(tailor_type, 'general'),
    current_capacity = COALESCE(current_capacity, 0),
    hourly_rate = COALESCE(hourly_rate, 0),
    efficiency_rating = COALESCE(efficiency_rating, 0),
    quality_rating = COALESCE(quality_rating, 0),
    is_active = COALESCE(is_active, true)
WHERE 
    tailor_type IS NULL 
    OR current_capacity IS NULL
    OR is_active IS NULL;

-- ============================================================================
-- PART 6: CREATE BATCH ASSIGNMENTS TABLE (IF NOT EXISTS)
-- ============================================================================

-- Create batch_assignments table if it doesn't exist
CREATE TABLE IF NOT EXISTS batch_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    employee_name TEXT NOT NULL,
    employee_avatar_url TEXT,
    assigned_date TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES auth.users(id),
    assigned_by_name TEXT,
    role TEXT DEFAULT 'tailor',
    hourly_rate DECIMAL(10,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on batch_assignments
ALTER TABLE batch_assignments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for batch_assignments
CREATE POLICY "Allow all operations for authenticated users" ON batch_assignments
    FOR ALL USING (auth.role() = 'authenticated');

-- Create indexes for batch_assignments
CREATE INDEX IF NOT EXISTS idx_batch_assignments_batch_id ON batch_assignments(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_assignments_employee_id ON batch_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_batch_assignments_assigned_date ON batch_assignments(assigned_date);
CREATE INDEX IF NOT EXISTS idx_batch_assignments_is_active ON batch_assignments(is_active);

-- ============================================================================
-- PART 7: CREATE TRIGGER FOR BATCH ASSIGNMENTS AUTO-POPULATION
-- ============================================================================

-- Function to auto-populate batch assignment names
CREATE OR REPLACE FUNCTION set_batch_assignment_names()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-populate employee_name from employee_id
    IF NEW.employee_name IS NULL AND NEW.employee_id IS NOT NULL THEN
        SELECT COALESCE(
            full_name,
            employee_code,
            'Unknown Employee'
        ) INTO NEW.employee_name
        FROM employees 
        WHERE id = NEW.employee_id;
    END IF;
    
    -- Auto-populate assigned_by_name from assigned_by
    IF NEW.assigned_by_name IS NULL AND NEW.assigned_by IS NOT NULL THEN
        SELECT COALESCE(
            (SELECT full_name FROM profiles WHERE user_id = NEW.assigned_by),
            (SELECT email FROM auth.users WHERE id = NEW.assigned_by),
            'Unknown User'
        ) INTO NEW.assigned_by_name;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger for batch_assignments
DROP TRIGGER IF EXISTS trigger_set_batch_assignment_names ON batch_assignments;
CREATE TRIGGER trigger_set_batch_assignment_names
    BEFORE INSERT OR UPDATE ON batch_assignments
    FOR EACH ROW
    EXECUTE FUNCTION set_batch_assignment_names();

-- ============================================================================
-- PART 8: GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions on tables
GRANT ALL ON batches TO postgres, anon, authenticated, service_role;
GRANT ALL ON batch_assignments TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 9: VERIFICATION
-- ============================================================================

SELECT 'Batches table tailor management columns added successfully!' as status;

-- Show updated table structure
SELECT 'Updated batches table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'batches' 
  AND table_schema = 'public'
  AND (column_name LIKE '%tailor%' OR column_name LIKE '%capacity%' OR column_name LIKE '%leader%')
ORDER BY column_name;

-- Test the new columns exist
SELECT 'Verification of tailor management columns:' as info;
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'batches' 
              AND column_name = 'tailor_type'
              AND table_schema = 'public'
        ) 
        THEN '✅ tailor_type column exists'
        ELSE '❌ tailor_type column missing'
    END as tailor_type_verification;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'batches' 
              AND column_name = 'current_capacity'
              AND table_schema = 'public'
        ) 
        THEN '✅ current_capacity column exists'
        ELSE '❌ current_capacity column missing'
    END as current_capacity_verification;

-- Show batches summary
SELECT 'Batches summary:' as info;
SELECT 
    COUNT(*) as total_batches,
    COUNT(CASE WHEN is_active = true THEN 1 END) as active_batches,
    COUNT(CASE WHEN tailor_type = 'general' THEN 1 END) as general_batches,
    COUNT(CASE WHEN batch_leader_id IS NOT NULL THEN 1 END) as batches_with_leaders
FROM batches;

-- Show sample batch data
SELECT 'Sample batch data:' as info;
SELECT 
    id,
    batch_name,
    batch_code,
    tailor_type,
    max_capacity,
    current_capacity,
    status,
    batch_leader_name,
    is_active
FROM batches 
LIMIT 3;
