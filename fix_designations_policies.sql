-- Fix existing designations table policies
-- This script can be run multiple times safely

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON designations;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON designations;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON designations;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON designations;

-- Recreate the policies
CREATE POLICY "Enable read access for authenticated users" ON designations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON designations
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users" ON designations
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable delete access for authenticated users" ON designations
  FOR DELETE TO authenticated USING (true);

-- Verify the policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'designations';
