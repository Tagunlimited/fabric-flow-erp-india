-- Add logo size configuration fields to company_settings table
-- This migration adds fields to control the size of different logos throughout the application

-- Add logo size configuration fields
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

-- Update existing records with default logo sizes
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

-- Add comment for documentation
COMMENT ON COLUMN company_settings.logo_sizes IS 'JSON object containing size configurations for different logos: sidebar_logo_height, sidebar_logo_width, header_logo_height, header_logo_width, company_logo_height, company_logo_width, favicon_size';

-- Success message
SELECT 'Logo size configuration fields added successfully!' as status;
