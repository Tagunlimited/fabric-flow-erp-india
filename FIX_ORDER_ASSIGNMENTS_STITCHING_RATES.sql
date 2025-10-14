-- ============================================================================
-- FIX: Order Assignments Stitching Rates Columns
-- Generated: October 8, 2025
-- Description: Adds missing stitching rate columns to order_assignments table
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

-- Check if stitching rate columns exist
SELECT 'Checking for stitching rate columns:' as info;
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_assignments' 
              AND column_name = 'cutting_price_single_needle'
              AND table_schema = 'public'
        ) 
        THEN '✅ cutting_price_single_needle exists'
        ELSE '❌ cutting_price_single_needle missing'
    END as single_needle_check;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_assignments' 
              AND column_name = 'cutting_price_overlock_flatlock'
              AND table_schema = 'public'
        ) 
        THEN '✅ cutting_price_overlock_flatlock exists'
        ELSE '❌ cutting_price_overlock_flatlock missing'
    END as overlock_flatlock_check;

-- ============================================================================
-- PART 2: ADD MISSING STITCHING RATE COLUMNS
-- ============================================================================

-- Add missing stitching rate columns to order_assignments table
ALTER TABLE order_assignments 
ADD COLUMN IF NOT EXISTS cutting_price_single_needle DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS cutting_price_overlock_flatlock DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS cutting_price_double_needle DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS cutting_price_coverstitch DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS cutting_price_zigzag DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS cutting_price_chainstitch DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_cutting_cost DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS stitching_notes TEXT,
ADD COLUMN IF NOT EXISTS rate_set_date TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS rate_set_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS rate_set_by_name TEXT;

-- ============================================================================
-- PART 3: ADD ADDITIONAL ASSIGNMENT TRACKING COLUMNS
-- ============================================================================

-- Add additional columns that might be missing for comprehensive order tracking
ALTER TABLE order_assignments 
ADD COLUMN IF NOT EXISTS assigned_quantity INTEGER,
ADD COLUMN IF NOT EXISTS completed_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rejected_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS quality_rating DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS completion_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS priority_level TEXT DEFAULT 'normal',
ADD COLUMN IF NOT EXISTS estimated_completion_date DATE,
ADD COLUMN IF NOT EXISTS actual_hours_worked DECIMAL(8,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_labor_cost DECIMAL(10,2) DEFAULT 0;

-- ============================================================================
-- PART 4: CREATE TRIGGER TO AUTO-CALCULATE TOTAL COST
-- ============================================================================

-- Function to calculate total cutting cost based on quantities and rates
CREATE OR REPLACE FUNCTION calculate_total_cutting_cost()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate total cutting cost based on assigned quantity and rates
    NEW.total_cutting_cost := COALESCE(NEW.assigned_quantity, 0) * (
        COALESCE(NEW.cutting_price_single_needle, 0) +
        COALESCE(NEW.cutting_price_overlock_flatlock, 0) +
        COALESCE(NEW.cutting_price_double_needle, 0) +
        COALESCE(NEW.cutting_price_coverstitch, 0) +
        COALESCE(NEW.cutting_price_zigzag, 0) +
        COALESCE(NEW.cutting_price_chainstitch, 0)
    );
    
    -- Auto-populate rate_set_date when rates are set
    IF NEW.cutting_price_single_needle > 0 OR NEW.cutting_price_overlock_flatlock > 0 THEN
        NEW.rate_set_date := NOW();
    END IF;
    
    -- Auto-populate rate_set_by_name from rate_set_by
    IF NEW.rate_set_by_name IS NULL AND NEW.rate_set_by IS NOT NULL THEN
        SELECT COALESCE(
            (SELECT full_name FROM profiles WHERE user_id = NEW.rate_set_by),
            (SELECT email FROM auth.users WHERE id = NEW.rate_set_by),
            'Unknown User'
        ) INTO NEW.rate_set_by_name;
    END IF;
    
    -- Update status_updated_at when rates change (since status column may not exist)
    IF (NEW.cutting_price_single_needle IS DISTINCT FROM OLD.cutting_price_single_needle) OR 
       (NEW.cutting_price_overlock_flatlock IS DISTINCT FROM OLD.cutting_price_overlock_flatlock) THEN
        NEW.status_updated_at := NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_calculate_total_cutting_cost ON order_assignments;
CREATE TRIGGER trigger_calculate_total_cutting_cost
    BEFORE INSERT OR UPDATE ON order_assignments
    FOR EACH ROW
    EXECUTE FUNCTION calculate_total_cutting_cost();

-- ============================================================================
-- PART 5: CREATE INDEXES FOR NEW COLUMNS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_order_assignments_rate_set_date ON order_assignments(rate_set_date);
CREATE INDEX IF NOT EXISTS idx_order_assignments_rate_set_by ON order_assignments(rate_set_by);
CREATE INDEX IF NOT EXISTS idx_order_assignments_total_cutting_cost ON order_assignments(total_cutting_cost);
CREATE INDEX IF NOT EXISTS idx_order_assignments_completion_date ON order_assignments(completion_date);
CREATE INDEX IF NOT EXISTS idx_order_assignments_priority_level ON order_assignments(priority_level);

-- ============================================================================
-- PART 6: UPDATE EXISTING RECORDS WITH DEFAULT VALUES
-- ============================================================================

-- Update existing records to have default values for new columns
UPDATE order_assignments 
SET 
    cutting_price_single_needle = COALESCE(cutting_price_single_needle, 0),
    cutting_price_overlock_flatlock = COALESCE(cutting_price_overlock_flatlock, 0),
    cutting_price_double_needle = COALESCE(cutting_price_double_needle, 0),
    cutting_price_coverstitch = COALESCE(cutting_price_coverstitch, 0),
    cutting_price_zigzag = COALESCE(cutting_price_zigzag, 0),
    cutting_price_chainstitch = COALESCE(cutting_price_chainstitch, 0),
    assigned_quantity = COALESCE(assigned_quantity, 0),
    completed_quantity = COALESCE(completed_quantity, 0),
    rejected_quantity = COALESCE(rejected_quantity, 0),
    actual_hours_worked = COALESCE(actual_hours_worked, 0),
    hourly_rate = COALESCE(hourly_rate, 0),
    total_labor_cost = COALESCE(total_labor_cost, 0)
WHERE 
    cutting_price_single_needle IS NULL 
    OR cutting_price_overlock_flatlock IS NULL
    OR assigned_quantity IS NULL;

-- ============================================================================
-- PART 7: VERIFICATION
-- ============================================================================

SELECT 'Order assignments stitching rates columns added successfully!' as status;

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
  AND column_name LIKE '%cutting_price%' OR column_name LIKE '%stitching%' OR column_name LIKE '%rate%'
ORDER BY column_name;

-- Test the new columns exist
SELECT 'Verification of stitching rate columns:' as info;
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_assignments' 
              AND column_name = 'cutting_price_single_needle'
              AND table_schema = 'public'
        ) 
        THEN '✅ cutting_price_single_needle column exists'
        ELSE '❌ cutting_price_single_needle column missing'
    END as single_needle_verification;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_assignments' 
              AND column_name = 'cutting_price_overlock_flatlock'
              AND table_schema = 'public'
        ) 
        THEN '✅ cutting_price_overlock_flatlock column exists'
        ELSE '❌ cutting_price_overlock_flatlock column missing'
    END as overlock_flatlock_verification;

-- Show sample data structure (only if table has data)
SELECT 'Sample order assignment with stitching rates:' as info;
SELECT 
    id,
    order_id,
    cutting_price_single_needle,
    cutting_price_overlock_flatlock,
    total_cutting_cost,
    rate_set_date,
    created_at
FROM order_assignments 
LIMIT 1;
