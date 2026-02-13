-- Fix customer_types table schema to match frontend expectations
-- This script will add the missing is_active column and ensure proper structure

-- First, check current table structure
SELECT 'Current customer_types table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'customer_types' 
ORDER BY ordinal_position;

-- Add is_active column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'customer_types' 
        AND column_name = 'is_active'
    ) THEN
        ALTER TABLE customer_types ADD COLUMN is_active BOOLEAN DEFAULT true;
        RAISE NOTICE 'Added is_active column to customer_types table';
    ELSE
        RAISE NOTICE 'is_active column already exists in customer_types table';
    END IF;
END $$;

-- Add updated_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'customer_types' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE customer_types ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'Added updated_at column to customer_types table';
    ELSE
        RAISE NOTICE 'updated_at column already exists in customer_types table';
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

-- Update existing records to have is_active = true if they don't have it set
UPDATE customer_types SET is_active = true WHERE is_active IS NULL;

-- Verify the updated table structure
SELECT 'Updated customer_types table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'customer_types' 
ORDER BY ordinal_position;

-- Show current data
SELECT 'Current Customer Types Data:' as info;
SELECT id, name, description, discount_percentage, is_active, created_at, updated_at 
FROM customer_types 
ORDER BY id;

-- Refresh the schema cache (this might help with the PostgREST cache issue)
NOTIFY pgrst, 'reload schema';
