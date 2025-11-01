-- Create customer_types table with proper structure for CRUD operations
-- This script ensures the customer_types table exists with all necessary fields

-- Drop existing table if it exists (be careful in production!)
-- DROP TABLE IF EXISTS customer_types CASCADE;

-- Create customer_types table
CREATE TABLE IF NOT EXISTS customer_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_percentage DECIMAL(5,2) DEFAULT 0,
  credit_days INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_customer_types_updated_at ON customer_types;
CREATE TRIGGER update_customer_types_updated_at
    BEFORE UPDATE ON customer_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE customer_types ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS "Enable read access for all users" ON customer_types;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON customer_types;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON customer_types;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON customer_types;

CREATE POLICY "Enable read access for all users" ON customer_types
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON customer_types
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON customer_types
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users only" ON customer_types
    FOR DELETE USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT ALL ON customer_types TO postgres, anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE customer_types_id_seq TO postgres, anon, authenticated, service_role;

-- Insert default customer types if table is empty
INSERT INTO customer_types (name, description, discount_percentage, credit_days, is_active) VALUES
  ('Wholesale', 'Bulk purchase customers with volume discounts', 15.00, 30, true),
  ('Retail', 'Individual customers with standard pricing', 0.00, 0, true),
  ('VIP', 'Premium customers with exclusive benefits', 25.00, 45, true),
  ('Corporate', 'Business customers with negotiated terms', 20.00, 60, true),
  ('Staff', 'Company staff purchases with special rates', 30.00, 0, true)
ON CONFLICT (name) DO NOTHING;

-- Verify the table structure
SELECT 'Customer Types Table Created Successfully' as status;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'customer_types' 
ORDER BY ordinal_position;

-- Show current data
SELECT 'Current Customer Types:' as info;
SELECT id, name, description, discount_percentage, credit_days, is_active, created_at 
FROM customer_types 
ORDER BY id;
