-- Create or fix fabrics table with proper structure and sample data
-- This script ensures the fabrics table exists with all necessary fields

-- Create fabrics table if it doesn't exist
CREATE TABLE IF NOT EXISTS fabrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fabric_name TEXT NOT NULL,
  color TEXT NOT NULL,
  gsm TEXT,
  composition TEXT,
  width TEXT,
  weight_per_unit DECIMAL(10,2),
  cost_per_unit DECIMAL(10,2),
  supplier_id UUID,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if they don't exist
DO $$
BEGIN
    -- Add fabric_name column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fabrics' AND column_name = 'fabric_name'
    ) THEN
        ALTER TABLE fabrics ADD COLUMN fabric_name TEXT;
        RAISE NOTICE 'Added fabric_name column to fabrics table';
    END IF;

    -- Add color column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fabrics' AND column_name = 'color'
    ) THEN
        ALTER TABLE fabrics ADD COLUMN color TEXT;
        RAISE NOTICE 'Added color column to fabrics table';
    END IF;

    -- Add gsm column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fabrics' AND column_name = 'gsm'
    ) THEN
        ALTER TABLE fabrics ADD COLUMN gsm TEXT;
        RAISE NOTICE 'Added gsm column to fabrics table';
    END IF;

    -- Add is_active column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fabrics' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE fabrics ADD COLUMN is_active BOOLEAN DEFAULT true;
        RAISE NOTICE 'Added is_active column to fabrics table';
    END IF;

    -- Add created_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fabrics' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE fabrics ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'Added created_at column to fabrics table';
    END IF;

    -- Add updated_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fabrics' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE fabrics ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'Added updated_at column to fabrics table';
    END IF;
END $$;

-- Create the updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create the trigger for updated_at
DROP TRIGGER IF EXISTS update_fabrics_updated_at ON fabrics;
CREATE TRIGGER update_fabrics_updated_at
    BEFORE UPDATE ON fabrics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE fabrics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS "Enable read access for all users" ON fabrics;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON fabrics;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON fabrics;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON fabrics;

CREATE POLICY "Enable read access for all users" ON fabrics
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON fabrics
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON fabrics
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users only" ON fabrics
    FOR DELETE USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT ALL ON fabrics TO postgres, anon, authenticated, service_role;

-- Insert the specific fabric that's causing the issue
INSERT INTO fabrics (
    id,
    fabric_name,
    color,
    gsm,
    is_active,
    created_at,
    updated_at
) VALUES (
    '2efae02b-816f-467e-a895-72e979434dc1',
    'Dotknit',
    'Maroon',
    '180 GSM',
    true,
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- Insert some common fabric types
INSERT INTO fabrics (fabric_name, color, gsm, is_active) VALUES
  ('Cotton', 'White', '180 GSM', true),
  ('Cotton', 'Black', '180 GSM', true),
  ('Cotton', 'Navy Blue', '180 GSM', true),
  ('Cotton', 'Red', '180 GSM', true),
  ('Cotton', 'Green', '180 GSM', true),
  ('Cotton', 'Yellow', '180 GSM', true),
  ('Cotton', 'Pink', '180 GSM', true),
  ('Cotton', 'Orange', '180 GSM', true),
  ('Cotton', 'Purple', '180 GSM', true),
  ('Cotton', 'Gray', '180 GSM', true),
  ('Cotton', 'Brown', '180 GSM', true),
  ('Cotton', 'Beige', '180 GSM', true),
  ('Polyester', 'White', '150 GSM', true),
  ('Polyester', 'Black', '150 GSM', true),
  ('Polyester', 'Navy Blue', '150 GSM', true),
  ('Polyester', 'Red', '150 GSM', true),
  ('Polyester', 'Green', '150 GSM', true),
  ('Polyester', 'Yellow', '150 GSM', true),
  ('Polyester', 'Pink', '150 GSM', true),
  ('Polyester', 'Orange', '150 GSM', true),
  ('Polyester', 'Purple', '150 GSM', true),
  ('Polyester', 'Gray', '150 GSM', true),
  ('Polyester', 'Brown', '150 GSM', true),
  ('Polyester', 'Beige', '150 GSM', true),
  ('Cotton Blend', 'White', '200 GSM', true),
  ('Cotton Blend', 'Black', '200 GSM', true),
  ('Cotton Blend', 'Navy Blue', '200 GSM', true),
  ('Cotton Blend', 'Red', '200 GSM', true),
  ('Cotton Blend', 'Green', '200 GSM', true),
  ('Cotton Blend', 'Yellow', '200 GSM', true),
  ('Cotton Blend', 'Pink', '200 GSM', true),
  ('Cotton Blend', 'Orange', '200 GSM', true),
  ('Cotton Blend', 'Purple', '200 GSM', true),
  ('Cotton Blend', 'Gray', '200 GSM', true),
  ('Cotton Blend', 'Brown', '200 GSM', true),
  ('Cotton Blend', 'Beige', '200 GSM', true)
ON CONFLICT DO NOTHING;

-- Verify the table structure
SELECT 'Fabrics table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'fabrics' 
ORDER BY ordinal_position;

-- Show current data
SELECT 'Current fabrics data:' as info;
SELECT id, fabric_name, color, gsm, is_active, created_at 
FROM fabrics 
ORDER BY created_at DESC 
LIMIT 10;

-- Refresh the schema cache
NOTIFY pgrst, 'reload schema';
