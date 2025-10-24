-- Add authorized signatory URL field to company_settings table
-- Run this in your Supabase SQL Editor

-- Add authorized_signatory_url column to company_settings table
ALTER TABLE company_settings 
ADD COLUMN IF NOT EXISTS authorized_signatory_url TEXT;

-- Add comment to document the new column
COMMENT ON COLUMN company_settings.authorized_signatory_url IS 'URL to the authorized signatory signature image that appears on all documents';

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'company_settings' 
AND column_name = 'authorized_signatory_url'
ORDER BY column_name;
