-- Add logo_sizes column to company_settings table
-- Run this SQL in your Supabase SQL Editor

-- Add the logo_sizes column if it doesn't exist
ALTER TABLE company_settings 
ADD COLUMN IF NOT EXISTS logo_sizes JSONB DEFAULT '{
  "sidebar_logo_height": "32px",
  "sidebar_logo_width": "auto",
  "header_logo_height": "32px", 
  "header_logo_width": "auto",
  "company_logo_height": "48px",
  "company_logo_width": "auto",
  "favicon_size": "16px"
}'::jsonb;

-- Update existing records with default logo sizes if they don't have the column
UPDATE company_settings 
SET logo_sizes = '{
  "sidebar_logo_height": "32px",
  "sidebar_logo_width": "auto",
  "header_logo_height": "32px",
  "header_logo_width": "auto", 
  "company_logo_height": "48px",
  "company_logo_width": "auto",
  "favicon_size": "16px"
}'::jsonb
WHERE logo_sizes IS NULL;

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'company_settings' AND column_name = 'logo_sizes';
