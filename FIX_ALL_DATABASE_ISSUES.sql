-- ============================================================================
-- COMPREHENSIVE FIX: All Database Schema Issues
-- Generated: October 8, 2025
-- Description: Fixes all database schema issues identified in console logs
-- ============================================================================

-- ============================================================================
-- PART 1: FIX DESIGNATIONS TABLE (Add missing is_active column)
-- ============================================================================

-- First, let's see what the current designations table looks like
SELECT 'Current designations table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'designations' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Add missing is_active column if it doesn't exist
ALTER TABLE designations 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add other missing columns that the application expects
ALTER TABLE designations 
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- If the table has designation_name instead of name, rename it
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'designations' AND column_name = 'designation_name') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'designations' AND column_name = 'name') THEN
        ALTER TABLE designations RENAME COLUMN designation_name TO name;
    END IF;
END $$;

-- Make name column NOT NULL if it's currently nullable
ALTER TABLE designations ALTER COLUMN name SET NOT NULL;

-- ============================================================================
-- PART 2: FIX FABRIC_MASTER TABLE (Add missing fabric_description column)
-- ============================================================================

-- Add missing fabric_description column
ALTER TABLE fabric_master 
ADD COLUMN IF NOT EXISTS fabric_description TEXT;

-- Add other missing columns that the application expects
ALTER TABLE fabric_master 
ADD COLUMN IF NOT EXISTS type TEXT,
ADD COLUMN IF NOT EXISTS hex TEXT,
ADD COLUMN IF NOT EXISTS gsm TEXT,
ADD COLUMN IF NOT EXISTS uom TEXT DEFAULT 'meters',
ADD COLUMN IF NOT EXISTS rate DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS hsn_code TEXT,
ADD COLUMN IF NOT EXISTS gst DECIMAL(5,2) DEFAULT 18.00,
ADD COLUMN IF NOT EXISTS image TEXT,
ADD COLUMN IF NOT EXISTS inventory NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS supplier1 TEXT,
ADD COLUMN IF NOT EXISTS supplier2 TEXT;

-- Rename existing columns to match application expectations
DO $$ 
BEGIN
    -- Rename price_per_meter to rate if it exists and rate doesn't exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'price_per_meter') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'rate') THEN
        ALTER TABLE fabric_master RENAME COLUMN price_per_meter TO rate;
    END IF;
    
    -- Rename image_url to image if it exists and image doesn't exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'image_url') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'image') THEN
        ALTER TABLE fabric_master RENAME COLUMN image_url TO image;
    END IF;
    
    -- Rename gst_rate to gst if it exists and gst doesn't exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'gst_rate') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'gst') THEN
        ALTER TABLE fabric_master RENAME COLUMN gst_rate TO gst;
    END IF;
    
    -- Rename supplier to supplier1 if it exists and supplier1 doesn't exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'supplier') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'supplier1') THEN
        ALTER TABLE fabric_master RENAME COLUMN supplier TO supplier1;
    END IF;
END $$;

-- ============================================================================
-- PART 3: CREATE DESIGNATION_DEPARTMENTS JUNCTION TABLE
-- ============================================================================

-- Create designation_departments junction table if it doesn't exist
CREATE TABLE IF NOT EXISTS designation_departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    designation_id UUID NOT NULL REFERENCES designations(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(designation_id, department_id)
);

-- ============================================================================
-- PART 4: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Designations table indexes
CREATE INDEX IF NOT EXISTS idx_designations_name ON designations(name);
CREATE INDEX IF NOT EXISTS idx_designations_is_active ON designations(is_active);

-- Fabric master table indexes
CREATE INDEX IF NOT EXISTS idx_fabric_master_code ON fabric_master(fabric_code);
CREATE INDEX IF NOT EXISTS idx_fabric_master_name ON fabric_master(fabric_name);
CREATE INDEX IF NOT EXISTS idx_fabric_master_type ON fabric_master(type);
CREATE INDEX IF NOT EXISTS idx_fabric_master_color ON fabric_master(color);
CREATE INDEX IF NOT EXISTS idx_fabric_master_status ON fabric_master(status);

-- Designation departments junction table indexes
CREATE INDEX IF NOT EXISTS idx_designation_departments_designation_id ON designation_departments(designation_id);
CREATE INDEX IF NOT EXISTS idx_designation_departments_department_id ON designation_departments(department_id);

-- ============================================================================
-- PART 5: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE designation_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_master ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 6: CREATE RLS POLICIES
-- ============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON designations;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON designations;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON designations;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON designations;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON designation_departments;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON designation_departments;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON designation_departments;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON designation_departments;

DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON fabric_master;
DROP POLICY IF EXISTS "Authenticated users can view all fabric master records" ON fabric_master;
DROP POLICY IF EXISTS "Authenticated users can manage fabric master records" ON fabric_master;

-- Create RLS policies for designations table
CREATE POLICY "Enable read access for authenticated users" ON designations
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON designations
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users" ON designations
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable delete access for authenticated users" ON designations
    FOR DELETE TO authenticated USING (true);

-- Create RLS policies for designation_departments table
CREATE POLICY "Enable read access for authenticated users" ON designation_departments
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON designation_departments
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users" ON designation_departments
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable delete access for authenticated users" ON designation_departments
    FOR DELETE TO authenticated USING (true);

-- Create RLS policies for fabric_master table
CREATE POLICY "Authenticated users can view all fabric master records" ON fabric_master
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage fabric master records" ON fabric_master
    FOR ALL USING (true);

-- ============================================================================
-- PART 7: CREATE TRIGGERS FOR AUTO TIMESTAMP UPDATE
-- ============================================================================

-- Create the update function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
DROP TRIGGER IF EXISTS update_designations_updated_at ON designations;
CREATE TRIGGER update_designations_updated_at
BEFORE UPDATE ON designations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fabric_master_updated_at ON fabric_master;
CREATE TRIGGER update_fabric_master_updated_at
BEFORE UPDATE ON fabric_master
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 8: CREATE DESIGNATIONS_WITH_DEPARTMENTS VIEW
-- ============================================================================

-- Drop the view if it exists
DROP VIEW IF EXISTS designations_with_departments;

-- Create the view using a dynamic approach
DO $$
DECLARE
    dept_name_column TEXT;
    view_sql TEXT;
BEGIN
    -- Find the name column in departments table
    SELECT column_name INTO dept_name_column
    FROM information_schema.columns 
    WHERE table_name = 'departments' 
      AND table_schema = 'public'
      AND column_name IN ('name', 'department_name', 'department_code', 'dept_name', 'dept_code')
    ORDER BY 
      CASE column_name 
        WHEN 'name' THEN 1
        WHEN 'department_name' THEN 2
        WHEN 'department_code' THEN 3
        WHEN 'dept_name' THEN 4
        WHEN 'dept_code' THEN 5
        ELSE 6
      END
    LIMIT 1;
    
    -- If no name column found, use 'id' as fallback
    IF dept_name_column IS NULL THEN
        dept_name_column := 'id';
    END IF;
    
    -- Build the view SQL dynamically
    view_sql := format('
        CREATE VIEW designations_with_departments AS
        SELECT 
            d.id,
            d.name,
            d.description,
            d.is_active,
            d.created_at,
            d.updated_at,
            d.created_by,
            COALESCE(
                json_agg(
                    json_build_object(
                        ''id'', dept.id,
                        ''name'', dept.%I
                    )
                ) FILTER (WHERE dept.id IS NOT NULL),
                ''[]''::json
            ) as departments
        FROM designations d
        LEFT JOIN designation_departments dd ON d.id = dd.designation_id
        LEFT JOIN departments dept ON dd.department_id = dept.id
        GROUP BY d.id, d.name, d.description, d.is_active, d.created_at, d.updated_at, d.created_by;
    ', dept_name_column);
    
    -- Execute the dynamic SQL
    EXECUTE view_sql;
    
    -- Log what column was used
    RAISE NOTICE 'Created designations_with_departments view using department column: %', dept_name_column;
END $$;

-- ============================================================================
-- PART 9: GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions on tables
GRANT ALL ON designations TO postgres, anon, authenticated, service_role;
GRANT ALL ON designation_departments TO postgres, anon, authenticated, service_role;
GRANT ALL ON fabric_master TO postgres, anon, authenticated, service_role;

-- Grant permissions on the view
GRANT ALL ON designations_with_departments TO postgres, anon, authenticated, service_role;

-- Grant permissions on sequences
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 10: INSERT SAMPLE DATA
-- ============================================================================

-- Insert some default designations if none exist
-- First, ensure the name column has a unique constraint
DO $$ 
BEGIN
    -- Only add unique constraint if name column exists and doesn't already have a unique constraint
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'designations' 
          AND column_name = 'name'
          AND table_schema = 'public'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'designations' 
          AND constraint_type = 'UNIQUE' 
          AND constraint_name LIKE '%name%'
          AND table_schema = 'public'
    ) THEN
        ALTER TABLE designations ADD CONSTRAINT designations_name_unique UNIQUE (name);
    END IF;
END $$;

-- Insert sample data without ON CONFLICT to avoid constraint issues
INSERT INTO designations (name, description, is_active) 
SELECT * FROM (VALUES
    ('Manager', 'Department Manager', true),
    ('Supervisor', 'Team Supervisor', true),
    ('Employee', 'Regular Employee', true),
    ('Intern', 'Intern/Trainee', true),
    ('Senior Manager', 'Senior Department Manager', true),
    ('Team Lead', 'Team Leader', true),
    ('Assistant Manager', 'Assistant to Manager', true),
    ('Senior Employee', 'Senior Level Employee', true),
    ('Sales Manager', 'Sales Department Manager', true)
) AS v(name, description, is_active)
WHERE NOT EXISTS (
    SELECT 1 FROM designations d WHERE d.name = v.name
);

-- ============================================================================
-- PART 11: VERIFICATION AND SUCCESS MESSAGE
-- ============================================================================

SELECT 
    'All database issues fixed successfully!' as status,
    'designations, fabric_master, and designations_with_departments view' as fixed_items;

-- Show final table structures
SELECT 'Final designations table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'designations' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

SELECT 'Final fabric_master table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'fabric_master' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

SELECT 'Final designations_with_departments view structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'designations_with_departments' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Test the view
SELECT 
    'View test - sample data:' as info,
    COUNT(*) as total_designations
FROM designations_with_departments;

-- Show first few records from the view
SELECT 
    id,
    name,
    description,
    is_active,
    departments
FROM designations_with_departments
LIMIT 5;
