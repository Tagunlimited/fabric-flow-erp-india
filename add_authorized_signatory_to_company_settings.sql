-- Add authorized_signatory_url column to company_settings table
-- This script will add the authorized signatory field to store signature images

-- Check current table structure
SELECT 'Current company_settings table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'company_settings' 
ORDER BY ordinal_position;

-- Add authorized_signatory_url column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'company_settings' AND column_name = 'authorized_signatory_url'
    ) THEN
        ALTER TABLE company_settings ADD COLUMN authorized_signatory_url TEXT;
        RAISE NOTICE 'Added authorized_signatory_url column to company_settings table';
    ELSE
        RAISE NOTICE 'authorized_signatory_url column already exists in company_settings table';
    END IF;
END $$;

-- Verify the updated table structure
SELECT 'Updated company_settings table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'company_settings' 
ORDER BY ordinal_position;

-- Show current data
SELECT 'Current company_settings data:' as info;
SELECT id, company_name, authorized_signatory_url, created_at 
FROM company_settings 
ORDER BY created_at DESC 
LIMIT 1;