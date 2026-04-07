-- Add payment QR image URL for invoice print layouts.
ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS payment_qr_url TEXT;

COMMENT ON COLUMN company_settings.payment_qr_url IS 'Public URL for company payment QR image shown on invoice.';
