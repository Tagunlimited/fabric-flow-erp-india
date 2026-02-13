-- Drop existing designations table and recreate with many-to-many relationship
DROP TABLE IF EXISTS designation_departments CASCADE;
DROP TABLE IF EXISTS designations CASCADE;

-- Create designations table (without department_id foreign key)
CREATE TABLE designations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create junction table for many-to-many relationship
CREATE TABLE designation_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  designation_id UUID NOT NULL REFERENCES designations(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(designation_id, department_id) -- Prevent duplicate relationships
);

-- Create indexes for better performance
CREATE INDEX idx_designations_name ON designations(name);
CREATE INDEX idx_designations_is_active ON designations(is_active);
CREATE INDEX idx_designation_departments_designation_id ON designation_departments(designation_id);
CREATE INDEX idx_designation_departments_department_id ON designation_departments(department_id);

-- Enable RLS on both tables
ALTER TABLE designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE designation_departments ENABLE ROW LEVEL SECURITY;

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

-- Create trigger for automatic timestamp updates (if the function exists)
DROP TRIGGER IF EXISTS update_designations_updated_at ON designations;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER update_designations_updated_at
      BEFORE UPDATE ON designations
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Insert some default designations
INSERT INTO designations (name, description) VALUES
  ('Manager', 'Department or team manager'),
  ('Senior Executive', 'Senior level executive'),
  ('Executive', 'Mid-level executive'),
  ('Associate', 'Entry to mid-level associate'),
  ('Trainee', 'Entry level trainee position'),
  ('Director', 'Senior management position'),
  ('CEO', 'Chief Executive Officer'),
  ('CTO', 'Chief Technology Officer'),
  ('CFO', 'Chief Financial Officer'),
  ('HR Manager', 'Human Resources Manager'),
  ('Sales Manager', 'Sales Department Manager'),
  ('Production Manager', 'Production Department Manager'),
  ('Quality Manager', 'Quality Control Manager'),
  ('Cutting Manager', 'Cutting Department Manager'),
  ('Stitching Manager', 'Stitching Department Manager'),
  ('Dispatch Manager', 'Dispatch and Logistics Manager')
ON CONFLICT (name) DO NOTHING;

-- Create a view to easily query designations with their departments
CREATE OR REPLACE VIEW designations_with_departments AS
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
        'id', dept.id,
        'name', dept.name
      )
    ) FILTER (WHERE dept.id IS NOT NULL),
    '[]'::json
  ) as departments
FROM designations d
LEFT JOIN designation_departments dd ON d.id = dd.designation_id
LEFT JOIN departments dept ON dd.department_id = dept.id
GROUP BY d.id, d.name, d.description, d.is_active, d.created_at, d.updated_at, d.created_by;

-- Verify the table structures
SELECT 'designations table structure:' as info;
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'designations' 
ORDER BY ordinal_position;

SELECT 'designation_departments table structure:' as info;
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'designation_departments' 
ORDER BY ordinal_position;
