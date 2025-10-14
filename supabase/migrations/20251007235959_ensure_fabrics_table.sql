-- ============================================================================
-- PRE-MIGRATION: Ensure Fabrics Table Exists
-- Created: October 8, 2025
-- Description: Creates fabrics and fabric_variants tables if they don't exist
-- This ensures dependencies are satisfied for the main migration
-- ============================================================================

-- Create fabrics table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS fabrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    description TEXT,
    image_url TEXT,
    name TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create fabric_variants table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS fabric_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    color TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    description TEXT,
    fabric_id UUID NOT NULL REFERENCES fabrics(id) ON DELETE CASCADE,
    gsm TEXT,
    hex_code TEXT,
    image_url TEXT,
    rate_per_meter DECIMAL(10,2),
    stock_quantity DECIMAL(10,2),
    uom TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create product_categories if it doesn't exist (needed by fabrics foreign key)
CREATE TABLE IF NOT EXISTS product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_image_url TEXT,
    category_images JSONB,
    category_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    description TEXT,
    fabrics TEXT[],
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key to fabrics if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fabrics_category_id_fkey' 
        AND table_name = 'fabrics'
    ) THEN
        ALTER TABLE fabrics 
        ADD CONSTRAINT fabrics_category_id_fkey 
        FOREIGN KEY (category_id) REFERENCES product_categories(id);
    END IF;
END $$;

-- Enable RLS
ALTER TABLE fabrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_variants ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON fabrics;
    CREATE POLICY "Allow all operations for authenticated users" ON fabrics FOR ALL USING (auth.role() = 'authenticated');
    
    DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON fabric_variants;
    CREATE POLICY "Allow all operations for authenticated users" ON fabric_variants FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION
    WHEN undefined_table THEN NULL;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_fabrics_category_id ON fabrics(category_id);
CREATE INDEX IF NOT EXISTS idx_fabric_variants_fabric_id ON fabric_variants(fabric_id);

-- Success message
SELECT 'Fabrics tables ensured!' as status;

