-- Complete customer_types table setup
-- This script will create the table with the correct structure or update existing table

-- Drop existing table if it exists (be careful in production!)
-- Uncomment the next line if you want to start fresh
-- DROP TABLE IF EXISTS customer_types CASCADE;

-- Create customer_types table with proper structure
CREATE TABLE IF NOT EXISTS customer_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_percentage DECIMAL(5,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if they don't exist
DO $$
BEGIN
    -- Add name column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customer_types' AND column_name = 'name'
    ) THEN
        ALTER TABLE customer_types ADD COLUMN name TEXT;
        RAISE NOTICE 'Added name column to customer_types table';
    END IF;

    -- Add description column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customer_types' AND column_name = 'description'
    ) THEN
        ALTER TABLE customer_types ADD COLUMN description TEXT;
        RAISE NOTICE 'Added description column to customer_types table';
    END IF;

    -- Add discount_percentage column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customer_types' AND column_name = 'discount_percentage'
    ) THEN
        ALTER TABLE customer_types ADD COLUMN discount_percentage DECIMAL(5,2) DEFAULT 0;
        RAISE NOTICE 'Added discount_percentage column to customer_types table';
    END IF;

    -- Add is_active column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customer_types' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE customer_types ADD COLUMN is_active BOOLEAN DEFAULT true;
        RAISE NOTICE 'Added is_active column to customer_types table';
    END IF;

    -- Add created_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customer_types' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE customer_types ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'Added created_at column to customer_types table';
    END IF;

    -- Add updated_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customer_types' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE customer_types ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'Added updated_at column to customer_types table';
    END IF;
END $$;

-- Add constraints if they don't exist
DO $$
BEGIN
    -- Add unique constraint on name if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'customer_types' 
        AND constraint_type = 'UNIQUE' 
        AND constraint_name LIKE '%name%'
    ) THEN
        ALTER TABLE customer_types ADD CONSTRAINT customer_types_name_unique UNIQUE (name);
        RAISE NOTICE 'Added unique constraint on name column';
    END IF;
END $$;

-- Create or replace the updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create or replace the trigger for updated_at
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
INSERT INTO customer_types (name, description, discount_percentage, is_active) VALUES
  ('Wholesale', 'Bulk purchase customers with volume discounts', 15.00, true),
  ('Retail', 'Individual customers with standard pricing', 0.00, true),
  ('VIP', 'Premium customers with exclusive benefits', 25.00, true),
  ('Corporate', 'Business customers with negotiated terms', 20.00, true),
  ('Staff', 'Company staff purchases with special rates', 30.00, true)
ON CONFLICT (name) DO NOTHING;

-- Verify the final table structure
SELECT 'Final customer_types table structure:' as info;
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
