-- ============================================================================
-- FIX: Company Settings Table Issues
-- Generated: October 8, 2025
-- Description: Fixes the company_settings table to have a single row structure
-- ============================================================================

-- ============================================================================
-- PART 1: DIAGNOSE THE CURRENT STATE
-- ============================================================================

-- Check current company_settings table structure
SELECT 'Current company_settings table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'company_settings' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check how many rows exist in company_settings
SELECT 'Current company_settings rows count:' as info;
SELECT COUNT(*) as row_count FROM company_settings;

-- Show current company_settings data
SELECT 'Current company_settings data:' as info;
SELECT * FROM company_settings ORDER BY created_at DESC;

-- Check what columns actually exist in company_settings
SELECT 'Available columns in company_settings:' as info;
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'company_settings' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================================================
-- PART 2: FIX THE COMPANY_SETTINGS TABLE
-- ============================================================================

-- Create a temporary table with the correct structure (matching application expectations)
CREATE TABLE IF NOT EXISTS company_settings_new (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT,
    -- Address fields (as expected by application)
    address TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    -- Contact fields (as expected by application)
    contact_email TEXT,
    contact_phone TEXT,
    -- Logo fields (as expected by application)
    logo_url TEXT,
    header_logo_url TEXT,
    sidebar_logo_url TEXT,
    favicon_url TEXT,
    -- Legal fields (as expected by application)
    gstin TEXT, -- Note: application uses 'gstin' not 'company_gst_number'
    bank_details JSONB,
    -- Additional fields
    company_website TEXT,
    company_pan_number TEXT,
    company_terms_conditions TEXT,
    company_privacy_policy TEXT,
    invoice_prefix TEXT DEFAULT 'INV',
    quote_prefix TEXT DEFAULT 'QUO',
    order_prefix TEXT DEFAULT 'ORD',
    receipt_prefix TEXT DEFAULT 'REC',
    po_prefix TEXT DEFAULT 'PO',
    grn_prefix TEXT DEFAULT 'GRN',
    bom_prefix TEXT DEFAULT 'BOM',
    currency TEXT DEFAULT 'INR',
    currency_symbol TEXT DEFAULT '₹',
    timezone TEXT DEFAULT 'Asia/Kolkata',
    date_format TEXT DEFAULT 'DD/MM/YYYY',
    fiscal_year_start DATE DEFAULT '2025-04-01',
    fiscal_year_end DATE DEFAULT '2026-03-31',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 3: MIGRATE DATA TO NEW STRUCTURE
-- ============================================================================

-- Insert a single default row with application-expected column structure
INSERT INTO company_settings_new (
    company_name,
    address,
    city,
    state,
    pincode,
    contact_email,
    contact_phone,
    logo_url,
    header_logo_url,
    sidebar_logo_url,
    favicon_url,
    gstin,
    bank_details,
    company_website,
    company_pan_number,
    company_terms_conditions,
    company_privacy_policy,
    invoice_prefix,
    quote_prefix,
    order_prefix,
    receipt_prefix,
    po_prefix,
    grn_prefix,
    bom_prefix,
    currency,
    currency_symbol,
    timezone,
    date_format,
    fiscal_year_start,
    fiscal_year_end,
    is_active
)
VALUES (
    'Scissors ERP',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '{
        "bank_name": "",
        "account_number": "",
        "ifsc_code": "",
        "branch_name": "",
        "account_holder_name": ""
    }'::jsonb,
    NULL,
    NULL,
    NULL,
    NULL,
    'INV',
    'QUO',
    'ORD',
    'REC',
    'PO',
    'GRN',
    'BOM',
    'INR',
    '₹',
    'Asia/Kolkata',
    'DD/MM/YYYY',
    '2025-04-01'::date,
    '2026-03-31'::date,
    true
);

-- ============================================================================
-- PART 4: REPLACE OLD TABLE WITH NEW TABLE
-- ============================================================================

-- Drop the old table
DROP TABLE IF EXISTS company_settings;

-- Rename the new table
ALTER TABLE company_settings_new RENAME TO company_settings;

-- ============================================================================
-- PART 5: CREATE INDEXES AND CONSTRAINTS
-- ============================================================================

-- Add unique constraint to ensure only one row
ALTER TABLE company_settings ADD CONSTRAINT company_settings_single_row CHECK (id IS NOT NULL);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_company_settings_active ON company_settings(is_active);

-- ============================================================================
-- PART 6: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON company_settings;
CREATE POLICY "Allow all operations for authenticated users" ON company_settings
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- PART 7: CREATE TRIGGERS
-- ============================================================================

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_company_settings_updated_at ON company_settings;
CREATE TRIGGER update_company_settings_updated_at
BEFORE UPDATE ON company_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 8: GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions
GRANT ALL ON company_settings TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 9: VERIFICATION
-- ============================================================================

SELECT 
    'Company settings table fixed successfully!' as status,
    'Single row structure created with consolidated data' as note;

-- Show final table structure
SELECT 'Final company_settings table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'company_settings' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Show the consolidated data
SELECT 'Consolidated company settings data:' as info;
SELECT 
    company_name,
    logo_url,
    address,
    city,
    state,
    contact_email,
    contact_phone,
    currency,
    currency_symbol,
    is_active
FROM company_settings;
