-- ============================================================================
-- FIX: Picker Save Issue - Missing picked_quantity column (SAFE VERSION)
-- Generated: October 8, 2025
-- Description: Fix the order_batch_size_distributions table to support picking functionality
-- ============================================================================

-- ============================================================================
-- PART 1: ADD MISSING COLUMNS TO order_batch_size_distributions
-- ============================================================================

-- Add missing columns to support picking functionality
ALTER TABLE order_batch_size_distributions 
ADD COLUMN IF NOT EXISTS picked_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rejected_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS estimated_completion_date DATE,
ADD COLUMN IF NOT EXISTS actual_completion_date DATE,
ADD COLUMN IF NOT EXISTS quality_rating DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS efficiency_rating DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- PART 2: SAFELY UPDATE EXISTING RECORDS WITH DEFAULT VALUES
-- ============================================================================

-- Set default values for existing records (only if columns exist and are NULL)
DO $$
BEGIN
    -- Update picked_quantity if it exists and is NULL
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_batch_size_distributions' AND column_name = 'picked_quantity') THEN
        UPDATE order_batch_size_distributions 
        SET picked_quantity = 0 
        WHERE picked_quantity IS NULL;
    END IF;
    
    -- Update rejected_quantity if it exists and is NULL
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_batch_size_distributions' AND column_name = 'rejected_quantity') THEN
        UPDATE order_batch_size_distributions 
        SET rejected_quantity = 0 
        WHERE rejected_quantity IS NULL;
    END IF;
    
    -- Update status if it exists and is NULL
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_batch_size_distributions' AND column_name = 'status') THEN
        UPDATE order_batch_size_distributions 
        SET status = 'pending' 
        WHERE status IS NULL;
    END IF;
    
    -- Update priority if it exists and is NULL
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_batch_size_distributions' AND column_name = 'priority') THEN
        UPDATE order_batch_size_distributions 
        SET priority = 1 
        WHERE priority IS NULL;
    END IF;
    
    -- Update updated_at if it exists and is NULL
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_batch_size_distributions' AND column_name = 'updated_at') THEN
        UPDATE order_batch_size_distributions 
        SET updated_at = NOW() 
        WHERE updated_at IS NULL;
    END IF;
END $$;

-- ============================================================================
-- PART 3: CREATE INDEXES FOR BETTER PERFORMANCE
-- ============================================================================

-- Create indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_order_batch_size_distributions_assignment_id ON order_batch_size_distributions(order_batch_assignment_id);
CREATE INDEX IF NOT EXISTS idx_order_batch_size_distributions_size_name ON order_batch_size_distributions(size_name);
CREATE INDEX IF NOT EXISTS idx_order_batch_size_distributions_status ON order_batch_size_distributions(status);
CREATE INDEX IF NOT EXISTS idx_order_batch_size_distributions_picked_quantity ON order_batch_size_distributions(picked_quantity);

-- ============================================================================
-- PART 4: ADD TRIGGER FOR AUTO-UPDATE
-- ============================================================================

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_order_batch_size_distributions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS trigger_update_order_batch_size_distributions_updated_at ON order_batch_size_distributions;
CREATE TRIGGER trigger_update_order_batch_size_distributions_updated_at
    BEFORE UPDATE ON order_batch_size_distributions
    FOR EACH ROW
    EXECUTE FUNCTION update_order_batch_size_distributions_updated_at();

-- ============================================================================
-- PART 5: UPDATE RLS POLICIES
-- ============================================================================

-- Ensure RLS policies exist for the new columns
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON order_batch_size_distributions;
CREATE POLICY "Enable read access for authenticated users" ON order_batch_size_distributions FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON order_batch_size_distributions;
CREATE POLICY "Enable insert for authenticated users" ON order_batch_size_distributions FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable update for authenticated users" ON order_batch_size_distributions;
CREATE POLICY "Enable update for authenticated users" ON order_batch_size_distributions FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable delete for authenticated users" ON order_batch_size_distributions;
CREATE POLICY "Enable delete for authenticated users" ON order_batch_size_distributions FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================================================
-- PART 6: RECREATE THE VIEW WITH NEW COLUMNS
-- ============================================================================

-- Drop and recreate the view to include picked_quantity
DROP VIEW IF EXISTS order_batch_assignments_with_details CASCADE;

CREATE VIEW order_batch_assignments_with_details AS
SELECT 
    oba.id,
    oba.id as assignment_id,  -- Alias for assignment_id
    oba.order_id,
    oba.batch_id,
    oba.assigned_by_id,
    oba.assigned_by_name,
    oba.assignment_date,
    oba.status,
    oba.notes,
    oba.size_s_quantity,
    oba.size_m_quantity,
    oba.size_l_quantity,
    oba.size_xl_quantity,
    oba.size_xxl_quantity,
    oba.size_xxxl_quantity,
    oba.total_quantity,
    oba.priority,
    oba.estimated_completion_date,
    oba.actual_completion_date,
    oba.quality_rating,
    oba.efficiency_rating,
    oba.is_active,
    oba.created_at,
    oba.updated_at,
    -- Batch details
    b.batch_name,
    b.batch_code,
    b.tailor_type,
    b.max_capacity,
    b.current_capacity,
    b.batch_leader_id,
    b.batch_leader_name,
    b.batch_leader_avatar_url,
    b.location,
    b.department,
    b.specialization,
    b.hourly_rate as batch_hourly_rate,
    b.efficiency_rating as batch_efficiency_rating,
    b.quality_rating as batch_quality_rating,
    b.status as batch_status,
    b.is_active as batch_is_active,
    -- Size distributions (aggregated with picked quantities)
    COALESCE(
        json_agg(
            json_build_object(
                'size_name', obsd.size_name,
                'quantity', obsd.quantity,
                'picked_quantity', COALESCE(obsd.picked_quantity, 0),
                'rejected_quantity', COALESCE(obsd.rejected_quantity, 0),
                'status', COALESCE(obsd.status, 'pending'),
                'priority', COALESCE(obsd.priority::integer, 1),
                'estimated_completion_date', obsd.estimated_completion_date,
                'actual_completion_date', obsd.actual_completion_date,
                'quality_rating', obsd.quality_rating,
                'efficiency_rating', obsd.efficiency_rating
            )
        ) FILTER (WHERE obsd.id IS NOT NULL),
        '[]'::json
    ) as size_distributions,
    -- Total picked quantity across all sizes
    COALESCE(SUM(COALESCE(obsd.picked_quantity, 0)), 0) as total_picked_quantity
FROM order_batch_assignments oba
LEFT JOIN batches b ON oba.batch_id = b.id
LEFT JOIN order_batch_size_distributions obsd ON oba.id = obsd.order_batch_assignment_id
GROUP BY 
    oba.id,
    oba.order_id,
    oba.batch_id,
    oba.assigned_by_id,
    oba.assigned_by_name,
    oba.assignment_date,
    oba.status,
    oba.notes,
    oba.size_s_quantity,
    oba.size_m_quantity,
    oba.size_l_quantity,
    oba.size_xl_quantity,
    oba.size_xxl_quantity,
    oba.size_xxxl_quantity,
    oba.total_quantity,
    oba.priority,
    oba.estimated_completion_date,
    oba.actual_completion_date,
    oba.quality_rating,
    oba.efficiency_rating,
    oba.is_active,
    oba.created_at,
    oba.updated_at,
    -- Batch details
    b.batch_name,
    b.batch_code,
    b.tailor_type,
    b.max_capacity,
    b.current_capacity,
    b.batch_leader_id,
    b.batch_leader_name,
    b.batch_leader_avatar_url,
    b.location,
    b.department,
    b.specialization,
    b.hourly_rate,
    b.efficiency_rating,
    b.quality_rating,
    b.status,
    b.is_active;

-- ============================================================================
-- PART 7: GRANT PERMISSIONS
-- ============================================================================

GRANT ALL ON order_batch_assignments_with_details TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 8: VERIFICATION
-- ============================================================================

SELECT 'Picker save functionality fixed successfully!' as status;

-- Test the table structure
SELECT 'Testing table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'order_batch_size_distributions' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Test the view structure
SELECT 'Testing view structure:' as info;
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'order_batch_assignments_with_details' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Test sample data
SELECT 'Testing sample data:' as info;
SELECT 
    obsd.id,
    obsd.order_batch_assignment_id,
    obsd.size_name,
    obsd.quantity,
    COALESCE(obsd.picked_quantity, 0) as picked_quantity,
    COALESCE(obsd.status, 'pending') as status,
    oba.batch_id
FROM order_batch_size_distributions obsd
LEFT JOIN order_batch_assignments oba ON obsd.order_batch_assignment_id = oba.id
WHERE oba.batch_id IN ('356cc5b3-90ff-4ff2-b647-e6311258b5b2', '7a8041df-3914-4056-a513-d3986364dc10')
LIMIT 5;
