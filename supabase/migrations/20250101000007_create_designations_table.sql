-- Create designations table
CREATE TABLE IF NOT EXISTS designations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  level INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_designations_name ON designations(name);
CREATE INDEX IF NOT EXISTS idx_designations_is_active ON designations(is_active);

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

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_designations_updated_at
  BEFORE UPDATE ON designations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert some default designations
INSERT INTO designations (name, description, level) VALUES
  ('Manager', 'Department or team manager', 5),
  ('Senior Executive', 'Senior level executive', 4),
  ('Executive', 'Mid-level executive', 3),
  ('Associate', 'Entry to mid-level associate', 2),
  ('Trainee', 'Entry level trainee position', 1),
  ('Director', 'Senior management position', 6),
  ('CEO', 'Chief Executive Officer', 7),
  ('CTO', 'Chief Technology Officer', 7),
  ('CFO', 'Chief Financial Officer', 7),
  ('HR Manager', 'Human Resources Manager', 5),
  ('Sales Manager', 'Sales Department Manager', 5),
  ('Production Manager', 'Production Department Manager', 5),
  ('Quality Manager', 'Quality Control Manager', 5),
  ('Cutting Manager', 'Cutting Department Manager', 5),
  ('Stitching Manager', 'Stitching Department Manager', 5),
  ('Dispatch Manager', 'Dispatch and Logistics Manager', 5)
ON CONFLICT (name) DO NOTHING;
