-- ============================================================================
-- FIX: Order Batch Size Distributions Table Missing Columns
-- Generated: October 8, 2025
-- Description: Adds missing columns to order_batch_size_distributions table for size-wise quantity tracking
-- ============================================================================

-- ============================================================================
-- PART 1: DIAGNOSE THE CURRENT STATE
-- ============================================================================

-- Check current order_batch_size_distributions table structure
SELECT 'Current order_batch_size_distributions table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'order_batch_size_distributions' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if size distribution columns exist
SELECT 'Checking for size distribution columns:' as info;
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_batch_size_distributions' 
              AND column_name = 'quantity'
              AND table_schema = 'public'
        ) 
        THEN '✅ quantity exists'
        ELSE '❌ quantity missing'
    END as quantity_check;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_batch_size_distributions' 
              AND column_name = 'size_name'
              AND table_schema = 'public'
        ) 
        THEN '✅ size_name exists'
        ELSE '❌ size_name missing'
    END as size_name_check;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_batch_size_distributions' 
              AND column_name = 'order_batch_assignment_id'
              AND table_schema = 'public'
        ) 
        THEN '✅ order_batch_assignment_id exists'
        ELSE '❌ order_batch_assignment_id missing'
    END as order_batch_assignment_id_check;

-- ============================================================================
-- PART 2: CREATE ORDER_BATCH_SIZE_DISTRIBUTIONS TABLE IF NOT EXISTS
-- ============================================================================

-- Create order_batch_size_distributions table if it doesn't exist
CREATE TABLE IF NOT EXISTS order_batch_size_distributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_batch_assignment_id UUID NOT NULL REFERENCES order_batch_assignments(id) ON DELETE CASCADE,
    size_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'assigned',
    priority TEXT DEFAULT 'normal',
    estimated_completion_date DATE,
    actual_completion_date DATE,
    quality_rating DECIMAL(3,2),
    efficiency_rating DECIMAL(3,2),
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 3: ADD MISSING COLUMNS TO EXISTING TABLE
-- ============================================================================

-- Add missing columns if the table already exists
ALTER TABLE order_batch_size_distributions 
ADD COLUMN IF NOT EXISTS order_batch_assignment_id UUID REFERENCES order_batch_assignments(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS size_name TEXT,
ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'assigned',
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal',
ADD COLUMN IF NOT EXISTS estimated_completion_date DATE,
ADD COLUMN IF NOT EXISTS actual_completion_date DATE,
ADD COLUMN IF NOT EXISTS quality_rating DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS efficiency_rating DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- PART 4: CREATE TRIGGER TO AUTO-POPULATE DATA
-- ============================================================================

-- Function to auto-populate size distribution data
CREATE OR REPLACE FUNCTION set_size_distribution_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-set status if not provided
    IF NEW.status IS NULL THEN
        NEW.status := 'assigned';
    END IF;
    
    -- Auto-set priority if not provided
    IF NEW.priority IS NULL THEN
        NEW.priority := 'normal';
    END IF;
    
    -- Auto-set is_active if not provided
    IF NEW.is_active IS NULL THEN
        NEW.is_active := true;
    END IF;
    
    -- Set default values for ratings
    IF NEW.quality_rating IS NULL THEN
        NEW.quality_rating := 0.0;
    END IF;
    
    IF NEW.efficiency_rating IS NULL THEN
        NEW.efficiency_rating := 0.0;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_set_size_distribution_data ON order_batch_size_distributions;
CREATE TRIGGER trigger_set_size_distribution_data
    BEFORE INSERT OR UPDATE ON order_batch_size_distributions
    FOR EACH ROW
    EXECUTE FUNCTION set_size_distribution_data();

-- ============================================================================
-- PART 5: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_order_batch_size_distributions_assignment_id ON order_batch_size_distributions(order_batch_assignment_id);
CREATE INDEX IF NOT EXISTS idx_order_batch_size_distributions_size_name ON order_batch_size_distributions(size_name);
CREATE INDEX IF NOT EXISTS idx_order_batch_size_distributions_quantity ON order_batch_size_distributions(quantity);
CREATE INDEX IF NOT EXISTS idx_order_batch_size_distributions_status ON order_batch_size_distributions(status);
CREATE INDEX IF NOT EXISTS idx_order_batch_size_distributions_is_active ON order_batch_size_distributions(is_active);

-- ============================================================================
-- PART 6: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE order_batch_size_distributions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for order_batch_size_distributions
CREATE POLICY "Allow all operations for authenticated users" ON order_batch_size_distributions
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- PART 7: CREATE TRIGGER FOR AUTO TIMESTAMP UPDATE
-- ============================================================================

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_order_batch_size_distributions_updated_at ON order_batch_size_distributions;
CREATE TRIGGER update_order_batch_size_distributions_updated_at
BEFORE UPDATE ON order_batch_size_distributions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 8: UPDATE EXISTING RECORDS WITH DEFAULT VALUES
-- ============================================================================

-- Update existing records to have default values for new columns
UPDATE order_batch_size_distributions 
SET 
    quantity = COALESCE(quantity, 0),
    status = COALESCE(status, 'assigned'),
    priority = COALESCE(priority, 'normal'),
    quality_rating = COALESCE(quality_rating, 0.0),
    efficiency_rating = COALESCE(efficiency_rating, 0.0),
    is_active = COALESCE(is_active, true)
WHERE 
    quantity IS NULL 
    OR status IS NULL
    OR is_active IS NULL;

-- ============================================================================
-- PART 9: GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions on tables
GRANT ALL ON order_batch_size_distributions TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 10: VERIFICATION
-- ============================================================================

SELECT 'Order batch size distributions table fixed successfully!' as status;

-- Show updated table structure
SELECT 'Updated order_batch_size_distributions table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'order_batch_size_distributions' 
  AND table_schema = 'public'
ORDER BY column_name;

-- Test the new columns exist
SELECT 'Verification of size distribution columns:' as info;
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_batch_size_distributions' 
              AND column_name = 'quantity'
              AND table_schema = 'public'
        ) 
        THEN '✅ quantity column exists'
        ELSE '❌ quantity column missing'
    END as quantity_verification;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_batch_size_distributions' 
              AND column_name = 'size_name'
              AND table_schema = 'public'
        ) 
        THEN '✅ size_name column exists'
        ELSE '❌ size_name column missing'
    END as size_name_verification;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'order_batch_size_distributions' 
              AND column_name = 'order_batch_assignment_id'
              AND table_schema = 'public'
        ) 
        THEN '✅ order_batch_assignment_id column exists'
        ELSE '❌ order_batch_assignment_id column missing'
    END as order_batch_assignment_id_verification;

-- Show size distributions summary
SELECT 'Order batch size distributions summary:' as info;
SELECT 
    COUNT(*) as total_distributions,
    COUNT(CASE WHEN is_active = true THEN 1 END) as active_distributions,
    COUNT(CASE WHEN status = 'assigned' THEN 1 END) as assigned_distributions,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_distributions,
    SUM(quantity) as total_pieces_distributed
FROM order_batch_size_distributions;

-- Show sample size distribution data
SELECT 'Sample order batch size distribution data:' as info;
SELECT 
    id,
    order_batch_assignment_id,
    size_name,
    quantity,
    status,
    priority,
    is_active
FROM order_batch_size_distributions 
LIMIT 5;
