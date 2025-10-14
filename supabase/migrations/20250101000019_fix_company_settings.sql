-- Fix Company Settings Table
-- Add missing columns to company_settings table

-- ==============================================
-- UPDATE COMPANY_SETTINGS TABLE
-- ==============================================
ALTER TABLE company_settings 
ADD COLUMN IF NOT EXISTS bank_details JSONB,
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS sidebar_logo_url TEXT,
ADD COLUMN IF NOT EXISTS header_logo_url TEXT,
ADD COLUMN IF NOT EXISTS favicon_url TEXT,
ADD COLUMN IF NOT EXISTS gstin VARCHAR(15),
ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);

-- ==============================================
-- UPDATE CUSTOMERS TABLE
-- ==============================================
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS company_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS contact_person VARCHAR(255);

-- ==============================================
-- INSERT DEFAULT COMPANY SETTINGS IF EMPTY
-- ==============================================
INSERT INTO company_settings (
    company_name, 
    address, 
    phone, 
    email, 
    gst_number,
    gstin,
    contact_phone,
    contact_email,
    bank_details
) VALUES (
    'Scissors ERP',
    'Your Company Address',
    '+91-XXXXXXXXXX',
    'contact@yourcompany.com',
    'XXAXXXXX0000X0XX',
    'XXAXXXXX0000X0X',
    '+91-XXXXXXXXXX',
    'contact@yourcompany.com',
    '{"bank_name": "Your Bank", "account_number": "1234567890", "ifsc_code": "ABCD0123456"}'
) ON CONFLICT DO NOTHING;

-- Success message
SELECT 'Company settings table updated successfully!' as status;
