-- ============================================================================
-- FIX: Add Missing Columns to Existing fabric_master Table
-- Generated: October 8, 2025
-- Description: Adds missing columns to the existing fabric_master table
-- ============================================================================

-- ============================================================================
-- PART 1: ADD MISSING COLUMNS TO EXISTING FABRIC_MASTER TABLE
-- ============================================================================

-- Add missing columns to the existing fabric_master table
ALTER TABLE fabric_master 
ADD COLUMN IF NOT EXISTS fabric_description TEXT,
ADD COLUMN IF NOT EXISTS type TEXT,
ADD COLUMN IF NOT EXISTS hex TEXT,
ADD COLUMN IF NOT EXISTS gsm TEXT,
ADD COLUMN IF NOT EXISTS uom TEXT DEFAULT 'meters',
ADD COLUMN IF NOT EXISTS rate DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS hsn_code TEXT,
ADD COLUMN IF NOT EXISTS gst DECIMAL(5,2) DEFAULT 18.00,
ADD COLUMN IF NOT EXISTS image TEXT,
ADD COLUMN IF NOT EXISTS inventory NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS supplier1 TEXT,
ADD COLUMN IF NOT EXISTS supplier2 TEXT;

-- ============================================================================
-- PART 2: RENAME EXISTING COLUMNS TO MATCH APPLICATION EXPECTATIONS
-- ============================================================================

-- Rename existing columns to match what the application expects
DO $$ 
BEGIN
    -- Rename price_per_meter to rate if it exists and rate doesn't exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'price_per_meter') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'rate') THEN
        ALTER TABLE fabric_master RENAME COLUMN price_per_meter TO rate;
    END IF;
    
    -- Rename image_url to image if it exists and image doesn't exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'image_url') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'image') THEN
        ALTER TABLE fabric_master RENAME COLUMN image_url TO image;
    END IF;
    
    -- Rename gst_rate to gst if it exists and gst doesn't exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'gst_rate') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'gst') THEN
        ALTER TABLE fabric_master RENAME COLUMN gst_rate TO gst;
    END IF;
    
    -- Rename supplier to supplier1 if it exists and supplier1 doesn't exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'supplier') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'supplier1') THEN
        ALTER TABLE fabric_master RENAME COLUMN supplier TO supplier1;
    END IF;
END $$;

-- ============================================================================
-- PART 3: CREATE INDEXES FOR NEW COLUMNS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_fabric_master_fabric_code ON fabric_master(fabric_code);
CREATE INDEX IF NOT EXISTS idx_fabric_master_fabric_name ON fabric_master(fabric_name);
CREATE INDEX IF NOT EXISTS idx_fabric_master_type ON fabric_master(type);
CREATE INDEX IF NOT EXISTS idx_fabric_master_color ON fabric_master(color);
CREATE INDEX IF NOT EXISTS idx_fabric_master_status ON fabric_master(status);

-- ============================================================================
-- PART 4: ENSURE RLS IS ENABLED
-- ============================================================================

ALTER TABLE fabric_master ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 5: CREATE/UPDATE RLS POLICIES
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON fabric_master;
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
-- PART 6: CREATE TRIGGER FOR AUTO TIMESTAMP UPDATE
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
-- PART 7: ADD TABLE COMMENTS FOR DOCUMENTATION
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
-- PART 8: GRANT PERMISSIONS
-- ============================================================================

-- Ensure proper permissions
GRANT ALL ON fabric_master TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- SUCCESS MESSAGE & VERIFICATION
-- ============================================================================

SELECT 
    'Fabric Master table columns added successfully!' as status,
    'fabric_master' as table_name,
    COUNT(*) as existing_records
FROM fabric_master;

-- Show current table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'fabric_master' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Verify all required columns exist
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'fabric_description') 
        THEN '✅ fabric_description exists'
        ELSE '❌ fabric_description missing'
    END as fabric_description_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'type') 
        THEN '✅ type exists'
        ELSE '❌ type missing'
    END as type_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'gsm') 
        THEN '✅ gsm exists'
        ELSE '❌ gsm missing'
    END as gsm_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'uom') 
        THEN '✅ uom exists'
        ELSE '❌ uom missing'
    END as uom_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'rate') 
        THEN '✅ rate exists'
        ELSE '❌ rate missing'
    END as rate_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'hsn_code') 
        THEN '✅ hsn_code exists'
        ELSE '❌ hsn_code missing'
    END as hsn_code_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'gst') 
        THEN '✅ gst exists'
        ELSE '❌ gst missing'
    END as gst_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'image') 
        THEN '✅ image exists'
        ELSE '❌ image missing'
    END as image_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'inventory') 
        THEN '✅ inventory exists'
        ELSE '❌ inventory missing'
    END as inventory_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'supplier1') 
        THEN '✅ supplier1 exists'
        ELSE '❌ supplier1 missing'
    END as supplier1_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'supplier2') 
        THEN '✅ supplier2 exists'
        ELSE '❌ supplier2 missing'
    END as supplier2_check;
