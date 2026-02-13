-- Drop the existing designations table if it exists (to recreate with correct schema)
DROP TABLE IF EXISTS designations CASCADE;

-- Create designations table with correct schema (without level column)
CREATE TABLE designations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create indexes for better performance
CREATE INDEX idx_designations_name ON designations(name);
CREATE INDEX idx_designations_department_id ON designations(department_id);
CREATE INDEX idx_designations_is_active ON designations(is_active);

-- Enable RLS
ALTER TABLE designations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Enable read access for authenticated users" ON designations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON designations
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users" ON designations
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable delete access for authenticated users" ON designations
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

-- Verify the table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'designations' 
ORDER BY ordinal_position;
