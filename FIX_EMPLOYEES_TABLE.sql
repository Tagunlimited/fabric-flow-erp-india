-- ============================================================================
-- FIX: Employees Table Schema Issues
-- Generated: October 8, 2025
-- Description: Fixes the employees table to match application expectations
-- ============================================================================

-- ============================================================================
-- PART 1: DIAGNOSE THE CURRENT STATE
-- ============================================================================

-- Check what columns currently exist in employees table
SELECT 'Current employees table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'employees' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================================================
-- PART 2: FIX THE EMPLOYEES TABLE
-- ============================================================================

-- Add missing columns that the application expects
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS gender TEXT,
ADD COLUMN IF NOT EXISTS marital_status TEXT,
ADD COLUMN IF NOT EXISTS blood_group TEXT,
ADD COLUMN IF NOT EXISTS personal_email TEXT,
ADD COLUMN IF NOT EXISTS personal_phone TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
ADD COLUMN IF NOT EXISTS address_line1 TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS pincode TEXT,
ADD COLUMN IF NOT EXISTS joining_date DATE,
ADD COLUMN IF NOT EXISTS employment_type TEXT,
ADD COLUMN IF NOT EXISTS reports_to UUID REFERENCES employees(id),
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Make employee_code nullable or add a default value
-- Option 1: Make it nullable (if your app doesn't need it)
ALTER TABLE employees ALTER COLUMN employee_code DROP NOT NULL;

-- Option 2: Add a default value generator (if you want to keep it required)
-- This will generate employee codes automatically
CREATE OR REPLACE FUNCTION generate_employee_code()
RETURNS TEXT AS $$
DECLARE
    new_code TEXT;
    counter INTEGER;
BEGIN
    -- Get the next number in sequence
    SELECT COALESCE(MAX(CAST(SUBSTRING(employee_code FROM '[0-9]+') AS INTEGER)), 0) + 1 
    INTO counter 
    FROM employees 
    WHERE employee_code ~ '^EMP[0-9]+$';
    
    -- Format as EMP001, EMP002, etc.
    new_code := 'EMP' || LPAD(counter::TEXT, 3, '0');
    
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to auto-generate employee_code if it's null
CREATE OR REPLACE FUNCTION set_employee_code()
RETURNS TRIGGER AS $$
BEGIN
    -- If employee_code is null or empty, generate one
    IF NEW.employee_code IS NULL OR NEW.employee_code = '' THEN
        NEW.employee_code := generate_employee_code();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_set_employee_code ON employees;
CREATE TRIGGER trigger_set_employee_code
    BEFORE INSERT ON employees
    FOR EACH ROW
    EXECUTE FUNCTION set_employee_code();

-- ============================================================================
-- PART 3: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Create indexes only for columns that exist
CREATE INDEX IF NOT EXISTS idx_employees_full_name ON employees(full_name);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_designation ON employees(designation);
CREATE INDEX IF NOT EXISTS idx_employees_employee_code ON employees(employee_code);

-- Conditionally create index for status column if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'employees' 
          AND column_name = 'status'
          AND table_schema = 'public'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
    END IF;
END $$;

-- ============================================================================
-- PART 4: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 5: CREATE RLS POLICIES
-- ============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON employees;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON employees;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON employees;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON employees;

-- Create RLS policies for employees table
CREATE POLICY "Enable read access for authenticated users" ON employees
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON employees
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users" ON employees
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable delete access for authenticated users" ON employees
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
DROP TRIGGER IF EXISTS update_employees_updated_at ON employees;
CREATE TRIGGER update_employees_updated_at
BEFORE UPDATE ON employees
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 7: GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions on tables
GRANT ALL ON employees TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 8: VERIFICATION
-- ============================================================================

SELECT 
    'Employees table fixed successfully!' as status,
    'employee_code will be auto-generated if not provided' as note;

-- Show final table structure
SELECT 'Final employees table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'employees' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Test the employee code generation function
SELECT 'Testing employee code generation:' as info;
SELECT generate_employee_code() as sample_employee_code;
