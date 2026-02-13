-- QUICK FIX for company_settings RLS policies
-- Run this directly in Supabase SQL Editor to fix the "Failed to create default company configuration" error

-- Step 1: Drop all existing policies
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON company_settings;
DROP POLICY IF EXISTS "Enable read access for all users" ON company_settings;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON company_settings;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON company_settings;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON company_settings;

-- Step 2: Create new comprehensive policies
CREATE POLICY "Enable read access for all users" ON company_settings
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON company_settings
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON company_settings
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users only" ON company_settings
    FOR DELETE USING (auth.role() = 'authenticated');

-- Step 3: Ensure RLS is enabled
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- Step 4: Grant permissions
GRANT ALL ON company_settings TO postgres, anon, authenticated, service_role;

-- Step 5: Insert default company settings if none exist
INSERT INTO company_settings (
    company_name,
    logo_url,
    sidebar_logo_url,
    header_logo_url,
    favicon_url,
    address,
    city,
    state,
    pincode,
    gstin,
    contact_phone,
    contact_email,
    bank_details
) VALUES (
    'Tag Unlimited Clothing',
    'https://i.postimg.cc/D0hJxKtP/tag-black.png',
    'https://i.postimg.cc/D0hJxKtP/tag-black.png',
    'https://i.postimg.cc/D0hJxKtP/tag-black.png',
    '/favicon.ico',
    '123 Business Street',
    'Mumbai',
    'Maharashtra',
    '400001',
    '27ABCDE1234F1Z5',
    '+91-9876543210',
    'ecom@tagunlimitedclothing.com',
    '{"bank_name": "HDFC Bank", "account_number": "1234567890", "ifsc_code": "HDFC0001234", "branch": "Mumbai Main"}'
) ON CONFLICT (id) DO NOTHING;

-- Step 6: Verify the fix
SELECT 'Company settings RLS policies fixed successfully!' as status;
SELECT COUNT(*) as record_count FROM company_settings;
