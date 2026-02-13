-- ============================================================================
-- FIX: Tailors Table Missing Columns
-- Generated: October 8, 2025
-- Description: Adds missing columns to tailors table for tailor management functionality
-- ============================================================================

-- ============================================================================
-- PART 1: DIAGNOSE THE CURRENT STATE
-- ============================================================================

-- Check current tailors table structure
SELECT 'Current tailors table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'tailors' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if tailor management columns exist
SELECT 'Checking for tailor management columns:' as info;
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'tailors' 
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
            WHERE table_name = 'tailors' 
              AND column_name = 'skill_level'
              AND table_schema = 'public'
        ) 
        THEN '✅ skill_level exists'
        ELSE '❌ skill_level missing'
    END as skill_level_check;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'tailors' 
              AND column_name = 'batch_id'
              AND table_schema = 'public'
        ) 
        THEN '✅ batch_id exists'
        ELSE '❌ batch_id missing'
    END as batch_id_check;

-- ============================================================================
-- PART 2: ADD MISSING TAILOR MANAGEMENT COLUMNS
-- ============================================================================

-- Add missing tailor management columns to tailors table
ALTER TABLE tailors 
ADD COLUMN IF NOT EXISTS tailor_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL,
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS tailor_type TEXT DEFAULT 'single_needle',
ADD COLUMN IF NOT EXISTS skill_level TEXT DEFAULT 'beginner',
ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id),
ADD COLUMN IF NOT EXISTS is_batch_leader BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS personal_phone TEXT,
ADD COLUMN IF NOT EXISTS personal_email TEXT,
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS gender TEXT,
ADD COLUMN IF NOT EXISTS address_line1 TEXT,
ADD COLUMN IF NOT EXISTS address_line2 TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS pincode TEXT,
ADD COLUMN IF NOT EXISTS joining_date DATE,
ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'full_time',
ADD COLUMN IF NOT EXISTS salary DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS work_hours_per_day INTEGER DEFAULT 8,
ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS specialization TEXT,
ADD COLUMN IF NOT EXISTS experience_years INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS efficiency_rating DECIMAL(3,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS quality_rating DECIMAL(3,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS attendance_percentage DECIMAL(5,2) DEFAULT 100,
ADD COLUMN IF NOT EXISTS last_working_date DATE,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS created_by_name TEXT,
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS updated_by_name TEXT;

-- ============================================================================
-- PART 3: CREATE TRIGGER TO AUTO-POPULATE TAILOR DATA
-- ============================================================================

-- Function to auto-populate tailor data and generate tailor code
CREATE OR REPLACE FUNCTION set_tailor_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-generate tailor_code if not provided
    IF NEW.tailor_code IS NULL OR NEW.tailor_code = '' THEN
        NEW.tailor_code := 'T-' || LPAD(
            COALESCE(
                (SELECT MAX(CAST(SUBSTRING(tailor_code FROM 3) AS INTEGER)) + 1 
                 FROM tailors 
                 WHERE tailor_code ~ '^T-[0-9]+$'), 
                1
            )::TEXT, 
            3, 
            '0'
        );
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
    
    -- Auto-calculate hourly_rate from salary and work_hours_per_day
    IF NEW.hourly_rate = 0 AND NEW.salary > 0 AND NEW.work_hours_per_day > 0 THEN
        NEW.hourly_rate := NEW.salary / (NEW.work_hours_per_day * 30); -- Assuming 30 working days per month
    END IF;
    
    -- Set default values for ratings
    IF NEW.efficiency_rating = 0 THEN
        NEW.efficiency_rating := 0.0;
    END IF;
    
    IF NEW.quality_rating = 0 THEN
        NEW.quality_rating := 0.0;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_set_tailor_data ON tailors;
CREATE TRIGGER trigger_set_tailor_data
    BEFORE INSERT OR UPDATE ON tailors
    FOR EACH ROW
    EXECUTE FUNCTION set_tailor_data();

-- ============================================================================
-- PART 4: CREATE INDEXES FOR NEW COLUMNS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tailors_tailor_code ON tailors(tailor_code);
CREATE INDEX IF NOT EXISTS idx_tailors_tailor_type ON tailors(tailor_type);
CREATE INDEX IF NOT EXISTS idx_tailors_skill_level ON tailors(skill_level);
CREATE INDEX IF NOT EXISTS idx_tailors_batch_id ON tailors(batch_id);
CREATE INDEX IF NOT EXISTS idx_tailors_is_batch_leader ON tailors(is_batch_leader);
CREATE INDEX IF NOT EXISTS idx_tailors_status ON tailors(status);
CREATE INDEX IF NOT EXISTS idx_tailors_employment_type ON tailors(employment_type);
CREATE INDEX IF NOT EXISTS idx_tailors_joining_date ON tailors(joining_date);

-- ============================================================================
-- PART 5: UPDATE EXISTING RECORDS WITH DEFAULT VALUES
-- ============================================================================

-- Update existing records to have default values for new columns
UPDATE tailors 
SET 
    tailor_type = COALESCE(tailor_type, 'single_needle'),
    skill_level = COALESCE(skill_level, 'beginner'),
    is_batch_leader = COALESCE(is_batch_leader, false),
    status = COALESCE(status, 'active'),
    employment_type = COALESCE(employment_type, 'full_time'),
    work_hours_per_day = COALESCE(work_hours_per_day, 8),
    salary = COALESCE(salary, 0),
    hourly_rate = COALESCE(hourly_rate, 0),
    experience_years = COALESCE(experience_years, 0),
    efficiency_rating = COALESCE(efficiency_rating, 0.0),
    quality_rating = COALESCE(quality_rating, 0.0),
    attendance_percentage = COALESCE(attendance_percentage, 100.0)
WHERE 
    tailor_type IS NULL 
    OR skill_level IS NULL
    OR status IS NULL;

-- ============================================================================
-- PART 6: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE tailors ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tailors
CREATE POLICY "Allow all operations for authenticated users" ON tailors
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- PART 7: GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions on tables
GRANT ALL ON tailors TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 8: VERIFICATION
-- ============================================================================

SELECT 'Tailors table tailor management columns added successfully!' as status;

-- Show updated table structure
SELECT 'Updated tailors table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'tailors' 
  AND table_schema = 'public'
  AND (column_name LIKE '%tailor%' OR column_name LIKE '%skill%' OR column_name LIKE '%batch%' OR column_name LIKE '%personal%' OR column_name LIKE '%address%' OR column_name LIKE '%employment%' OR column_name LIKE '%salary%')
ORDER BY column_name;

-- Test the new columns exist
SELECT 'Verification of tailor management columns:' as info;
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'tailors' 
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
            WHERE table_name = 'tailors' 
              AND column_name = 'skill_level'
              AND table_schema = 'public'
        ) 
        THEN '✅ skill_level column exists'
        ELSE '❌ skill_level column missing'
    END as skill_level_verification;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'tailors' 
              AND column_name = 'batch_id'
              AND table_schema = 'public'
        ) 
        THEN '✅ batch_id column exists'
        ELSE '❌ batch_id column missing'
    END as batch_id_verification;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'tailors' 
              AND column_name = 'is_batch_leader'
              AND table_schema = 'public'
        ) 
        THEN '✅ is_batch_leader column exists'
        ELSE '❌ is_batch_leader column missing'
    END as is_batch_leader_verification;

-- Show tailors summary
SELECT 'Tailors summary:' as info;
SELECT 
    COUNT(*) as total_tailors,
    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_tailors,
    COUNT(CASE WHEN tailor_type = 'single_needle' THEN 1 END) as single_needle_tailors,
    COUNT(CASE WHEN tailor_type = 'overlock' THEN 1 END) as overlock_tailors,
    COUNT(CASE WHEN is_batch_leader = true THEN 1 END) as batch_leaders,
    COUNT(CASE WHEN batch_id IS NOT NULL THEN 1 END) as assigned_to_batches
FROM tailors;

-- Show sample tailor data
SELECT 'Sample tailor data:' as info;
SELECT 
    id,
    tailor_code,
    full_name,
    tailor_type,
    skill_level,
    batch_id,
    is_batch_leader,
    status,
    personal_phone,
    personal_email,
    employment_type,
    salary,
    work_hours_per_day
FROM tailors 
LIMIT 3;
