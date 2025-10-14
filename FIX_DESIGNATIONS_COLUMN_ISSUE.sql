-- ============================================================================
-- FIX: Designations Column Issue
-- Generated: October 8, 2025
-- Description: Fixes the designation_name vs name column issue
-- ============================================================================

-- ============================================================================
-- PART 1: DIAGNOSE THE CURRENT STATE
-- ============================================================================

-- Check what columns currently exist in designations table
SELECT 'Current designations table columns:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'designations' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check constraints on designations table
SELECT 'Current designations table constraints:' as info;
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'designations' 
  AND tc.table_schema = 'public'
ORDER BY tc.constraint_name;

-- ============================================================================
-- PART 2: FIX THE COLUMN ISSUE
-- ============================================================================

-- Step 1: Drop the NOT NULL constraint on designation_name if it exists
ALTER TABLE designations ALTER COLUMN designation_name DROP NOT NULL;

-- Step 2: Make sure we have a name column
ALTER TABLE designations 
ADD COLUMN IF NOT EXISTS name TEXT;

-- Step 3: Copy data from designation_name to name if name is empty
UPDATE designations 
SET name = designation_name 
WHERE name IS NULL AND designation_name IS NOT NULL;

-- Step 4: Make name column NOT NULL
ALTER TABLE designations ALTER COLUMN name SET NOT NULL;

-- Step 5: Add other missing columns
ALTER TABLE designations 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Step 6: Drop the old designation_name column (optional - we can keep it for now)
-- ALTER TABLE designations DROP COLUMN IF EXISTS designation_name;

-- ============================================================================
-- PART 3: CREATE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_designations_name ON designations(name);
CREATE INDEX IF NOT EXISTS idx_designations_is_active ON designations(is_active);

-- ============================================================================
-- PART 4: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE designations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 5: CREATE RLS POLICIES
-- ============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON designations;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON designations;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON designations;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON designations;

-- Create RLS policies for designations table
CREATE POLICY "Enable read access for authenticated users" ON designations
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON designations
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users" ON designations
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable delete access for authenticated users" ON designations
    FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- PART 6: CREATE TRIGGER FOR AUTO TIMESTAMP UPDATE
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
-- PART 7: GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions on tables
GRANT ALL ON designations TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 8: VERIFICATION
-- ============================================================================

SELECT 
    'Designations column issue fixed!' as status,
    'Both designation_name and name columns are now available' as note;

-- Show final table structure
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

-- Test inserting a record
SELECT 'Testing insert capability:' as info;
INSERT INTO designations (name, description, is_active) 
VALUES ('Test Designation', 'Test Description', true)
ON CONFLICT DO NOTHING;

-- Show the test record
SELECT 'Test record inserted:' as info;
SELECT id, name, description, is_active FROM designations WHERE name = 'Test Designation';

-- Clean up test record
DELETE FROM designations WHERE name = 'Test Designation';
