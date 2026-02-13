-- ============================================================================
-- ADD ID PROOF FIELDS TO EMPLOYEES TABLE
-- Generated: January 21, 2025
-- Description: Adds ID proof image and number fields to employees table
-- ============================================================================

-- Add ID proof fields to employees table
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS id_proof_type TEXT CHECK (id_proof_type IN ('Aadhaar', 'PAN', 'Driving License', 'Passport', 'Voter ID', 'Other')),
ADD COLUMN IF NOT EXISTS id_proof_number TEXT,
ADD COLUMN IF NOT EXISTS id_proof_image_url TEXT,
ADD COLUMN IF NOT EXISTS id_proof_back_image_url TEXT;

-- Create index for ID proof number for faster searches
CREATE INDEX IF NOT EXISTS idx_employees_id_proof_number ON employees(id_proof_number);

-- Add comment to document the new fields
COMMENT ON COLUMN employees.id_proof_type IS 'Type of ID proof document (Aadhaar, PAN, etc.)';
COMMENT ON COLUMN employees.id_proof_number IS 'ID proof document number';
COMMENT ON COLUMN employees.id_proof_image_url IS 'URL of the front image of ID proof document';
COMMENT ON COLUMN employees.id_proof_back_image_url IS 'URL of the back image of ID proof document (if applicable)';

-- Update the check constraint to make ID proof fields required for new employees
-- Note: This will only apply to new records, existing records can be updated separately
ALTER TABLE employees 
ADD CONSTRAINT check_id_proof_required 
CHECK (
  -- If any ID proof field is provided, core fields should be provided (back image is optional)
  (id_proof_type IS NULL AND id_proof_number IS NULL AND id_proof_image_url IS NULL AND id_proof_back_image_url IS NULL) OR
  (id_proof_type IS NOT NULL AND id_proof_number IS NOT NULL AND id_proof_image_url IS NOT NULL)
);

-- Create a function to validate ID proof numbers based on type
CREATE OR REPLACE FUNCTION validate_id_proof_number(proof_type TEXT, proof_number TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Basic validation based on ID proof type
  CASE proof_type
    WHEN 'Aadhaar' THEN
      -- Aadhaar should be 12 digits
      RETURN proof_number ~ '^[0-9]{12}$';
    WHEN 'PAN' THEN
      -- PAN should be 10 characters: 5 letters, 4 digits, 1 letter
      RETURN proof_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]{1}$';
    WHEN 'Driving License' THEN
      -- Driving license format varies by state, basic validation
      RETURN LENGTH(proof_number) >= 8 AND LENGTH(proof_number) <= 20;
    WHEN 'Passport' THEN
      -- Passport format varies by country, basic validation
      RETURN LENGTH(proof_number) >= 6 AND LENGTH(proof_number) <= 15;
    WHEN 'Voter ID' THEN
      -- Voter ID format varies, basic validation
      RETURN LENGTH(proof_number) >= 8 AND LENGTH(proof_number) <= 15;
    ELSE
      -- For 'Other' type, just check it's not empty
      RETURN LENGTH(proof_number) >= 3;
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to validate ID proof numbers before insert/update
CREATE OR REPLACE FUNCTION validate_employee_id_proof()
RETURNS TRIGGER AS $$
BEGIN
  -- Only validate if ID proof fields are provided
  IF NEW.id_proof_type IS NOT NULL AND NEW.id_proof_number IS NOT NULL THEN
    IF NOT validate_id_proof_number(NEW.id_proof_type, NEW.id_proof_number) THEN
      RAISE EXCEPTION 'Invalid % number format: %', NEW.id_proof_type, NEW.id_proof_number;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_validate_employee_id_proof ON employees;
CREATE TRIGGER trigger_validate_employee_id_proof
  BEFORE INSERT OR UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION validate_employee_id_proof();

-- Grant permissions
GRANT ALL ON employees TO postgres, anon, authenticated, service_role;

-- Verification query
SELECT 
  'ID proof fields added successfully!' as status,
  'New fields: id_proof_type, id_proof_number, id_proof_image_url, id_proof_back_image_url' as note;

-- Show updated table structure
SELECT 'Updated employees table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'employees' 
  AND table_schema = 'public'
  AND column_name IN ('id_proof_type', 'id_proof_number', 'id_proof_image_url', 'id_proof_back_image_url')
ORDER BY ordinal_position;
