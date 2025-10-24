-- ============================================================================
-- ADD BANK DETAILS FIELDS TO TAILORS TABLE
-- Generated: January 21, 2025
-- Description: Adds bank details fields to tailors table
-- ============================================================================

-- Add bank details fields to tailors table
ALTER TABLE tailors 
ADD COLUMN IF NOT EXISTS bank_name TEXT,
ADD COLUMN IF NOT EXISTS account_holder_name TEXT,
ADD COLUMN IF NOT EXISTS account_number TEXT,
ADD COLUMN IF NOT EXISTS ifsc_code TEXT,
ADD COLUMN IF NOT EXISTS passbook_image_url TEXT;

-- Create index for account number for faster searches
CREATE INDEX IF NOT EXISTS idx_tailors_account_number ON tailors(account_number);

-- Create index for IFSC code for faster searches
CREATE INDEX IF NOT EXISTS idx_tailors_ifsc_code ON tailors(ifsc_code);

-- Add comment to document the new fields
COMMENT ON COLUMN tailors.bank_name IS 'Name of the bank';
COMMENT ON COLUMN tailors.account_holder_name IS 'Name of the account holder';
COMMENT ON COLUMN tailors.account_number IS 'Bank account number';
COMMENT ON COLUMN tailors.ifsc_code IS 'IFSC code of the bank branch';
COMMENT ON COLUMN tailors.passbook_image_url IS 'URL of the passbook image';

-- Update the check constraint to make bank details fields required for new tailors
-- Note: This will only apply to new records, existing records can be updated separately
ALTER TABLE tailors 
ADD CONSTRAINT check_tailor_bank_details_required 
CHECK (
  -- If any bank detail field is provided, all core fields should be provided
  (bank_name IS NULL AND account_holder_name IS NULL AND account_number IS NULL AND ifsc_code IS NULL AND passbook_image_url IS NULL) OR
  (bank_name IS NOT NULL AND account_holder_name IS NOT NULL AND account_number IS NOT NULL AND ifsc_code IS NOT NULL AND passbook_image_url IS NOT NULL)
);

-- Create a function to validate IFSC code format (reuse from employees)
CREATE OR REPLACE FUNCTION validate_tailor_ifsc_code(ifsc TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- IFSC code should be 11 characters: 4 letters (bank code) + 7 characters (branch code)
  -- Format: ABCD0123456 (4 letters + 7 alphanumeric)
  RETURN ifsc ~ '^[A-Z]{4}[0-9A-Z]{7}$';
END;
$$ LANGUAGE plpgsql;

-- Create a function to validate account number format (reuse from employees)
CREATE OR REPLACE FUNCTION validate_tailor_account_number(account_number TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Account number should be between 9 and 18 digits
  RETURN account_number ~ '^[0-9]{9,18}$';
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to validate bank details before insert/update
CREATE OR REPLACE FUNCTION validate_tailor_bank_details()
RETURNS TRIGGER AS $$
BEGIN
  -- Only validate if bank details are provided
  IF NEW.bank_name IS NOT NULL AND NEW.account_number IS NOT NULL AND NEW.ifsc_code IS NOT NULL THEN
    -- Validate IFSC code format
    IF NOT validate_tailor_ifsc_code(NEW.ifsc_code) THEN
      RAISE EXCEPTION 'Invalid IFSC code format: %. Expected format: ABCD0123456', NEW.ifsc_code;
    END IF;
    
    -- Validate account number format
    IF NOT validate_tailor_account_number(NEW.account_number) THEN
      RAISE EXCEPTION 'Invalid account number format: %. Account number should be 9-18 digits', NEW.account_number;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_validate_tailor_bank_details ON tailors;
CREATE TRIGGER trigger_validate_tailor_bank_details
  BEFORE INSERT OR UPDATE ON tailors
  FOR EACH ROW
  EXECUTE FUNCTION validate_tailor_bank_details();

-- Grant permissions
GRANT ALL ON tailors TO postgres, anon, authenticated, service_role;

-- Verification query
SELECT 
  'Bank details fields added to tailors table successfully!' as status,
  'New fields: bank_name, account_holder_name, account_number, ifsc_code, passbook_image_url' as note;

-- Show updated table structure
SELECT 'Updated tailors table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'tailors' 
  AND table_schema = 'public'
  AND column_name IN ('bank_name', 'account_holder_name', 'account_number', 'ifsc_code', 'passbook_image_url')
ORDER BY ordinal_position;
