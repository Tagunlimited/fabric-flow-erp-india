-- ============================================================================
-- FIX: Create fabric_master table for Fabric Manager
-- Generated: October 8, 2025
-- Description: Creates the fabric_master table that the application expects
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE FABRIC_MASTER TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS fabric_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fabric_code TEXT NOT NULL UNIQUE,
    fabric_name TEXT NOT NULL,
    fabric_description TEXT,
    type TEXT,
    color TEXT,
    hex TEXT,
    gsm TEXT,
    uom TEXT DEFAULT 'meters',
    rate DECIMAL(10,2) DEFAULT 0,
    hsn_code TEXT,
    gst DECIMAL(5,2) DEFAULT 18.00,
    image TEXT,
    inventory NUMERIC DEFAULT 0,
    supplier1 TEXT,
    supplier2 TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 2: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_fabric_master_code ON fabric_master(fabric_code);
CREATE INDEX IF NOT EXISTS idx_fabric_master_name ON fabric_master(fabric_name);
CREATE INDEX IF NOT EXISTS idx_fabric_master_type ON fabric_master(type);
CREATE INDEX IF NOT EXISTS idx_fabric_master_color ON fabric_master(color);
CREATE INDEX IF NOT EXISTS idx_fabric_master_status ON fabric_master(status);

-- ============================================================================
-- PART 3: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE fabric_master ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 4: CREATE RLS POLICIES
-- ============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Authenticated users can view all fabric master records" ON fabric_master;
DROP POLICY IF EXISTS "Authenticated users can manage fabric master records" ON fabric_master;

-- Create new policies
CREATE POLICY "Authenticated users can view all fabric master records" 
ON fabric_master 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can manage fabric master records" 
ON fabric_master 
FOR ALL 
USING (true);

-- ============================================================================
-- PART 5: CREATE TRIGGER FOR AUTO TIMESTAMP UPDATE
-- ============================================================================

-- Create the update function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_fabric_master_updated_at ON fabric_master;
CREATE TRIGGER update_fabric_master_updated_at
BEFORE UPDATE ON fabric_master
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 6: ADD TABLE COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE fabric_master IS 'Master table for fabric inventory management with comprehensive fabric details';
COMMENT ON COLUMN fabric_master.fabric_code IS 'Unique identifier code for the fabric';
COMMENT ON COLUMN fabric_master.fabric_description IS 'Detailed description of the fabric';
COMMENT ON COLUMN fabric_master.fabric_name IS 'Name of the fabric';
COMMENT ON COLUMN fabric_master.type IS 'Type or category of the fabric';
COMMENT ON COLUMN fabric_master.color IS 'Color of the fabric';
COMMENT ON COLUMN fabric_master.hex IS 'Hexadecimal color code';
COMMENT ON COLUMN fabric_master.gsm IS 'Grams per square meter - fabric weight';
COMMENT ON COLUMN fabric_master.uom IS 'Unit of measure (meters, yards, etc.)';
COMMENT ON COLUMN fabric_master.rate IS 'Price rate per unit';
COMMENT ON COLUMN fabric_master.hsn_code IS 'Harmonized System of Nomenclature code for taxation';
COMMENT ON COLUMN fabric_master.gst IS 'Goods and Services Tax rate';
COMMENT ON COLUMN fabric_master.image IS 'Image URL or path for fabric visual reference';
COMMENT ON COLUMN fabric_master.inventory IS 'Current stock quantity';
COMMENT ON COLUMN fabric_master.supplier1 IS 'Primary supplier information';
COMMENT ON COLUMN fabric_master.supplier2 IS 'Secondary supplier information';

-- ============================================================================
-- PART 7: GRANT PERMISSIONS
-- ============================================================================

-- Ensure proper permissions
GRANT ALL ON fabric_master TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- SUCCESS MESSAGE & VERIFICATION
-- ============================================================================

SELECT 
    'Fabric Master table created successfully!' as status,
    'fabric_master' as table_name,
    COUNT(*) as existing_records
FROM fabric_master;

-- Show table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'fabric_master' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================================================
-- SAMPLE DATA (OPTIONAL - REMOVE IF NOT NEEDED)
-- ============================================================================

-- Uncomment the following lines if you want to add sample data
/*
INSERT INTO fabric_master (
    fabric_code, 
    fabric_description, 
    fabric_name, 
    type, 
    color, 
    hex, 
    gsm, 
    uom, 
    rate, 
    hsn_code, 
    gst, 
    inventory, 
    supplier1, 
    supplier2
) VALUES 
(
    'FAB001', 
    'Premium Cotton Jersey Fabric', 
    'Cotton Jersey', 
    'Cotton', 
    'Black', 
    '#000000', 
    '180', 
    'meters', 
    150.00, 
    '5208', 
    18.00, 
    100, 
    'ABC Textiles', 
    'XYZ Fabrics'
),
(
    'FAB002', 
    'Polyester Blend Fabric', 
    'Poly Blend', 
    'Polyester', 
    'White', 
    '#FFFFFF', 
    '200', 
    'meters', 
    120.00, 
    '5407', 
    18.00, 
    75, 
    'DEF Suppliers', 
    'GHI Textiles'
)
ON CONFLICT (fabric_code) DO NOTHING;
*/
