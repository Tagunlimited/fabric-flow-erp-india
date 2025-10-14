-- ============================================================================
-- FIX: Create designations_with_departments view (Dynamic Version)
-- Generated: October 8, 2025
-- Description: Creates the view by first checking what columns actually exist
-- ============================================================================

-- ============================================================================
-- PART 1: ENSURE REQUIRED TABLES EXIST
-- ============================================================================

-- Create designations table if it doesn't exist
CREATE TABLE IF NOT EXISTS designations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Create designation_departments junction table if it doesn't exist
CREATE TABLE IF NOT EXISTS designation_departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    designation_id UUID NOT NULL REFERENCES designations(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(designation_id, department_id)
);

-- ============================================================================
-- PART 2: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_designations_name ON designations(name);
CREATE INDEX IF NOT EXISTS idx_designations_is_active ON designations(is_active);
CREATE INDEX IF NOT EXISTS idx_designation_departments_designation_id ON designation_departments(designation_id);
CREATE INDEX IF NOT EXISTS idx_designation_departments_department_id ON designation_departments(department_id);

-- ============================================================================
-- PART 3: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE designation_departments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 4: CREATE RLS POLICIES
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

-- ============================================================================
-- PART 5: CREATE TRIGGER FOR AUTO TIMESTAMP UPDATE
-- ============================================================================

-- Create the update function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_designations_updated_at ON designations;
CREATE TRIGGER update_designations_updated_at
BEFORE UPDATE ON designations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 6: CREATE THE DESIGNATIONS_WITH_DEPARTMENTS VIEW (DYNAMIC VERSION)
-- ============================================================================

-- Drop the view if it exists
DROP VIEW IF EXISTS designations_with_departments;

-- Create the view using a dynamic approach
-- This version creates the view based on what columns actually exist
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
    RAISE NOTICE 'Created view using department column: %', dept_name_column;
END $$;

-- ============================================================================
-- PART 7: GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions on tables
GRANT ALL ON designations TO postgres, anon, authenticated, service_role;
GRANT ALL ON designation_departments TO postgres, anon, authenticated, service_role;

-- Grant permissions on the view
GRANT ALL ON designations_with_departments TO postgres, anon, authenticated, service_role;

-- Grant permissions on sequences
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 8: INSERT SAMPLE DATA (OPTIONAL)
-- ============================================================================

-- Insert some default designations if none exist
INSERT INTO designations (name, description, is_active) VALUES
    ('Manager', 'Department Manager', true),
    ('Supervisor', 'Team Supervisor', true),
    ('Employee', 'Regular Employee', true),
    ('Intern', 'Intern/Trainee', true),
    ('Senior Manager', 'Senior Department Manager', true),
    ('Team Lead', 'Team Leader', true),
    ('Assistant Manager', 'Assistant to Manager', true),
    ('Senior Employee', 'Senior Level Employee', true)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- SUCCESS MESSAGE & VERIFICATION
-- ============================================================================

SELECT 
    'Designations with departments view created successfully!' as status,
    'designations_with_departments' as view_name;

-- Show what column was used for department names
SELECT 
    'Department name column used:' as info,
    column_name
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

-- Show table structures
SELECT 'designations table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'designations' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

SELECT 'departments table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'departments' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Show view structure
SELECT 'designations_with_departments view structure:' as info;
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
