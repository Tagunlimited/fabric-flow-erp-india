-- Simple BOM RLS fix - run this in Supabase SQL Editor

-- Enable RLS on both tables
ALTER TABLE bom_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_record_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for all users" ON bom_records;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON bom_records;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON bom_records;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON bom_records;

DROP POLICY IF EXISTS "Enable read access for all users" ON bom_record_items;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON bom_record_items;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON bom_record_items;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON bom_record_items;

-- Create comprehensive RLS policies for bom_records
CREATE POLICY "Enable read access for all users" ON bom_records
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON bom_records
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON bom_records
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users only" ON bom_records
    FOR DELETE USING (auth.role() = 'authenticated');

-- Create comprehensive RLS policies for bom_record_items
CREATE POLICY "Enable read access for all users" ON bom_record_items
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON bom_record_items
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON bom_record_items
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users only" ON bom_record_items
    FOR DELETE USING (auth.role() = 'authenticated');

-- Grant necessary permissions
GRANT ALL ON bom_records TO postgres, anon, authenticated, service_role;
GRANT ALL ON bom_record_items TO postgres, anon, authenticated, service_role;
