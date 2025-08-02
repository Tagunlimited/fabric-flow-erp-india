-- Create company_settings table
CREATE TABLE IF NOT EXISTS company_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_name TEXT NOT NULL DEFAULT '',
    logo_url TEXT NOT NULL DEFAULT '/placeholder.svg',
    sidebar_logo_url TEXT DEFAULT '/placeholder.svg',
    header_logo_url TEXT DEFAULT '/placeholder.svg',
    favicon_url TEXT DEFAULT '/favicon.ico',
    address TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    pincode TEXT NOT NULL DEFAULT '',
    gstin TEXT NOT NULL DEFAULT '',
    contact_phone TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    bank_details JSONB NOT NULL DEFAULT '{"bank_name": "", "account_number": "", "ifsc_code": "", "branch": ""}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create a trigger to update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_company_settings_updated_at 
    BEFORE UPDATE ON company_settings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert a default company settings record
INSERT INTO company_settings (company_name, logo_url, sidebar_logo_url, header_logo_url, favicon_url, address, city, state, pincode, gstin, contact_phone, contact_email, bank_details)
VALUES (
    'Tag Unlimited Clothing',
    'https://i.postimg.cc/D0hJxKtP/tag-black.png',
    'https://i.postimg.cc/D0hJxKtP/tag-black.png',
    'https://i.postimg.cc/D0hJxKtP/tag-black.png',
    'https://i.postimg.cc/D0hJxKtP/tag-black.png',
    '123 Business Street',
    'Mumbai',
    'Maharashtra',
    '400001',
    '27AAAAA0000A1Z5',
    '+91 9876543210',
    'info@tagunlimitedclothing.com',
    '{"bank_name": "HDFC Bank", "account_number": "12345678901234", "ifsc_code": "HDFC0001234", "branch": "Andheri West"}'::jsonb
) ON CONFLICT DO NOTHING;
