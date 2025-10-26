-- Simple fix for customer_types table
-- This script will create the table with proper sequence handling

-- Drop existing table if it exists to start fresh
DROP TABLE IF EXISTS customer_types CASCADE;

-- Create customer_types table with proper structure
CREATE TABLE customer_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_percentage DECIMAL(5,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create the updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create the trigger for updated_at
CREATE TRIGGER update_customer_types_updated_at
    BEFORE UPDATE ON customer_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE customer_types ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
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

-- Insert default customer types
INSERT INTO customer_types (name, description, discount_percentage, is_active) VALUES
  ('Wholesale', 'Bulk purchase customers with volume discounts', 15.00, true),
  ('Retail', 'Individual customers with standard pricing', 0.00, true),
  ('VIP', 'Premium customers with exclusive benefits', 25.00, true),
  ('Corporate', 'Business customers with negotiated terms', 20.00, true),
  ('Staff', 'Company staff purchases with special rates', 30.00, true);

-- Verify the table structure
SELECT 'Customer Types Table Structure:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'customer_types' 
ORDER BY ordinal_position;

-- Show current data
SELECT 'Current Customer Types Data:' as info;
SELECT id, name, description, discount_percentage, is_active, created_at, updated_at 
FROM customer_types 
ORDER BY id;

-- Refresh the schema cache
NOTIFY pgrst, 'reload schema';
