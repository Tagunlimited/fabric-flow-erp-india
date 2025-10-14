-- ============================================================================
-- FIX: Complete Picker Fix - SAFE VERSION (Handles existing data)
-- Generated: October 8, 2025
-- Description: Complete fix for all Picker issues with safe data handling
-- ============================================================================

-- ============================================================================
-- PART 1: SAFELY CLEAN UP EXISTING DATA FIRST
-- ============================================================================

-- Clean up any existing data that might cause type conflicts
DO $$
BEGIN
    -- Fix priority column if it has text values
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_batch_size_distributions' AND column_name = 'priority') THEN
        -- Update text priority values to integers
        UPDATE order_batch_size_distributions 
        SET priority = CASE 
            WHEN priority::text ILIKE 'high' THEN 3
            WHEN priority::text ILIKE 'medium' THEN 2
            WHEN priority::text ILIKE 'normal' THEN 1
            WHEN priority::text ILIKE 'low' THEN 1
            ELSE 1
        END
        WHERE priority::text ~ '^[a-zA-Z]+$';
    END IF;
END $$;

-- ============================================================================
-- PART 2: ENSURE ALL REQUIRED TABLES EXIST
-- ============================================================================

-- Ensure order_batch_assignments table exists with all required columns
CREATE TABLE IF NOT EXISTS order_batch_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    batch_id UUID NOT NULL,
    assigned_by_id UUID,
    assigned_by_name TEXT,
    assignment_date DATE DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    size_s_quantity INTEGER DEFAULT 0,
    size_m_quantity INTEGER DEFAULT 0,
    size_l_quantity INTEGER DEFAULT 0,
    size_xl_quantity INTEGER DEFAULT 0,
    size_xxl_quantity INTEGER DEFAULT 0,
    size_xxxl_quantity INTEGER DEFAULT 0,
    total_quantity INTEGER DEFAULT 0,
    priority INTEGER DEFAULT 1,
    estimated_completion_date DATE,
    actual_completion_date DATE,
    quality_rating DECIMAL(3,2),
    efficiency_rating DECIMAL(3,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_order_batch_assignment UNIQUE(order_id, batch_id)
);

-- Ensure order_batch_size_distributions table exists with all required columns
CREATE TABLE IF NOT EXISTS order_batch_size_distributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_batch_assignment_id UUID NOT NULL,
    size_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    picked_quantity INTEGER DEFAULT 0,
    rejected_quantity INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    priority INTEGER DEFAULT 1,
    estimated_completion_date DATE,
    actual_completion_date DATE,
    quality_rating DECIMAL(3,2),
    efficiency_rating DECIMAL(3,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_assignment_size UNIQUE(order_batch_assignment_id, size_name)
);

-- Ensure batches table exists with all required columns
CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_name TEXT NOT NULL,
    batch_code TEXT,
    tailor_type TEXT,
    max_capacity INTEGER DEFAULT 100,
    current_capacity INTEGER DEFAULT 0,
    batch_leader_id UUID,
    batch_leader_name TEXT,
    batch_leader_avatar_url TEXT,
    location TEXT,
    department TEXT,
    specialization TEXT,
    hourly_rate DECIMAL(10,2),
    efficiency_rating DECIMAL(3,2),
    quality_rating DECIMAL(3,2),
    status TEXT DEFAULT 'active',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 3: ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================================================

-- Add missing columns to order_batch_assignments
ALTER TABLE order_batch_assignments 
ADD COLUMN IF NOT EXISTS assigned_by_id UUID,
ADD COLUMN IF NOT EXISTS assigned_by_name TEXT,
ADD COLUMN IF NOT EXISTS assignment_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS size_s_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS size_m_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS size_l_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS size_xl_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS size_xxl_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS size_xxxl_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS estimated_completion_date DATE,
ADD COLUMN IF NOT EXISTS actual_completion_date DATE,
ADD COLUMN IF NOT EXISTS quality_rating DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS efficiency_rating DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add missing columns to order_batch_size_distributions
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

-- Add missing columns to batches
ALTER TABLE batches 
ADD COLUMN IF NOT EXISTS batch_code TEXT,
ADD COLUMN IF NOT EXISTS tailor_type TEXT,
ADD COLUMN IF NOT EXISTS max_capacity INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS current_capacity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS batch_leader_id UUID,
ADD COLUMN IF NOT EXISTS batch_leader_name TEXT,
ADD COLUMN IF NOT EXISTS batch_leader_avatar_url TEXT,
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS department TEXT,
ADD COLUMN IF NOT EXISTS specialization TEXT,
ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS efficiency_rating DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS quality_rating DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- PART 4: CREATE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_order_batch_assignments_order_id ON order_batch_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_batch_assignments_batch_id ON order_batch_assignments(batch_id);
CREATE INDEX IF NOT EXISTS idx_order_batch_size_distributions_assignment_id ON order_batch_size_distributions(order_batch_assignment_id);
CREATE INDEX IF NOT EXISTS idx_batches_name ON batches(batch_name);

-- ============================================================================
-- PART 5: DROP AND RECREATE THE VIEW WITH SAFE TYPE HANDLING
-- ============================================================================

DROP VIEW IF EXISTS order_batch_assignments_with_details CASCADE;

CREATE VIEW order_batch_assignments_with_details AS
SELECT 
    oba.id,
    oba.id as assignment_id,  -- Alias for assignment_id (required by Picker)
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
    -- Batch details with exact column names expected by Picker
    b.batch_name,
    b.batch_code,
    b.tailor_type,
    b.max_capacity,
    b.current_capacity,
    b.batch_leader_id,
    b.batch_leader_name,
    b.batch_leader_avatar_url as batch_leader_avatar,  -- Alias to match Picker expectation
    b.location,
    b.department,
    b.specialization,
    b.hourly_rate as batch_hourly_rate,
    b.efficiency_rating as batch_efficiency_rating,
    b.quality_rating as batch_quality_rating,
    b.status as batch_status,
    b.is_active as batch_is_active,
    -- Size distributions (aggregated with safe type handling)
    COALESCE(
        json_agg(
            json_build_object(
                'size_name', obsd.size_name,
                'quantity', obsd.quantity,
                'picked_quantity', COALESCE(obsd.picked_quantity, 0),
                'rejected_quantity', COALESCE(obsd.rejected_quantity, 0),
                'status', COALESCE(obsd.status, 'pending'),
                'priority', COALESCE(
                    CASE 
                        WHEN obsd.priority IS NULL THEN 1
                        WHEN obsd.priority::text ~ '^[0-9]+$' THEN obsd.priority::integer
                        ELSE 1
                    END, 1
                ),
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
-- PART 6: SET UP RLS POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE order_batch_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_batch_size_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;

-- Create policies for order_batch_assignments
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON order_batch_assignments;
CREATE POLICY "Enable read access for authenticated users" ON order_batch_assignments FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON order_batch_assignments;
CREATE POLICY "Enable insert for authenticated users" ON order_batch_assignments FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable update for authenticated users" ON order_batch_assignments;
CREATE POLICY "Enable update for authenticated users" ON order_batch_assignments FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable delete for authenticated users" ON order_batch_assignments;
CREATE POLICY "Enable delete for authenticated users" ON order_batch_assignments FOR DELETE USING (auth.role() = 'authenticated');

-- Create policies for order_batch_size_distributions
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON order_batch_size_distributions;
CREATE POLICY "Enable read access for authenticated users" ON order_batch_size_distributions FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON order_batch_size_distributions;
CREATE POLICY "Enable insert for authenticated users" ON order_batch_size_distributions FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable update for authenticated users" ON order_batch_size_distributions;
CREATE POLICY "Enable update for authenticated users" ON order_batch_size_distributions FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable delete for authenticated users" ON order_batch_size_distributions;
CREATE POLICY "Enable delete for authenticated users" ON order_batch_size_distributions FOR DELETE USING (auth.role() = 'authenticated');

-- Create policies for batches
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON batches;
CREATE POLICY "Enable read access for authenticated users" ON batches FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON batches;
CREATE POLICY "Enable insert for authenticated users" ON batches FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable update for authenticated users" ON batches;
CREATE POLICY "Enable update for authenticated users" ON batches FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable delete for authenticated users" ON batches;
CREATE POLICY "Enable delete for authenticated users" ON batches FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================================================
-- PART 7: GRANT PERMISSIONS
-- ============================================================================

GRANT ALL ON order_batch_assignments TO postgres, anon, authenticated, service_role;
GRANT ALL ON order_batch_size_distributions TO postgres, anon, authenticated, service_role;
GRANT ALL ON batches TO postgres, anon, authenticated, service_role;
GRANT ALL ON order_batch_assignments_with_details TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 8: VERIFICATION
-- ============================================================================

SELECT 'Picker fix completed successfully!' as status;

-- Test the view structure
SELECT 'View structure verification:' as info;
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'order_batch_assignments_with_details' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Test the exact query that Picker uses
SELECT 'Testing Picker query 1:' as info;
SELECT 
    assignment_id,
    order_id,
    total_quantity,
    batch_name,
    batch_leader_name,
    batch_leader_avatar
FROM order_batch_assignments_with_details 
ORDER BY assignment_date DESC
LIMIT 5;

-- Test the exact query that Picker uses for batch filtering
SELECT 'Testing Picker query 2:' as info;
SELECT 
    assignment_id,
    order_id,
    assignment_date,
    total_quantity,
    size_distributions,
    batch_name
FROM order_batch_assignments_with_details 
WHERE batch_id = '356cc5b3-90ff-4ff2-b647-e6311258b5b2'
ORDER BY assignment_date DESC
LIMIT 5;
