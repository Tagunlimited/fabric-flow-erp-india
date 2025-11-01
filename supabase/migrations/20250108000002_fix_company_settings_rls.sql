-- Fix company_settings RLS policies to allow proper access
-- This script addresses the "new row violates row-level security policy" error

-- Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON company_settings;
DROP POLICY IF EXISTS "Enable read access for all users" ON company_settings;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON company_settings;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON company_settings;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON company_settings;

-- Create comprehensive RLS policies for company_settings
-- Policy 1: Allow read access for all authenticated users
CREATE POLICY "Enable read access for all users" ON company_settings
    FOR SELECT USING (true);

-- Policy 2: Allow insert for authenticated users
CREATE POLICY "Enable insert for authenticated users only" ON company_settings
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Policy 3: Allow update for authenticated users
CREATE POLICY "Enable update for authenticated users only" ON company_settings
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Policy 4: Allow delete for authenticated users (if needed)
CREATE POLICY "Enable delete for authenticated users only" ON company_settings
    FOR DELETE USING (auth.role() = 'authenticated');

-- Ensure RLS is enabled
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions
GRANT ALL ON company_settings TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- Insert a default company settings record if none exists
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
