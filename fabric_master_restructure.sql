-- Fabric Master Table Restructure
-- This script will drop the existing fabrics and fabric_variants tables
-- and create a new comprehensive fabric_master table

-- Step 1: Drop existing tables and their dependencies
DROP TABLE IF EXISTS public.fabric_variants CASCADE;
DROP TABLE IF EXISTS public.fabrics CASCADE;

-- Step 2: Create the new fabric_master table with all required fields
CREATE TABLE public.fabric_master (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fabric_code TEXT NOT NULL UNIQUE,
  fabric_description TEXT,
  fabric_name TEXT NOT NULL,
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Step 3: Create indexes for better performance
CREATE INDEX idx_fabric_master_code ON public.fabric_master(fabric_code);
CREATE INDEX idx_fabric_master_name ON public.fabric_master(fabric_name);
CREATE INDEX idx_fabric_master_type ON public.fabric_master(type);
CREATE INDEX idx_fabric_master_color ON public.fabric_master(color);
CREATE INDEX idx_fabric_master_status ON public.fabric_master(status);

-- Step 4: Enable Row Level Security (RLS)
ALTER TABLE public.fabric_master ENABLE ROW LEVEL SECURITY;

-- Step 5: Create RLS policies
CREATE POLICY "Authenticated users can view all fabric master records" 
ON public.fabric_master 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can manage fabric master records" 
ON public.fabric_master 
FOR ALL 
USING (true);

-- Step 6: Create trigger for automatic timestamp updates
CREATE TRIGGER update_fabric_master_updated_at
BEFORE UPDATE ON public.fabric_master
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Step 7: Add comments for documentation
COMMENT ON TABLE public.fabric_master IS 'Master table for fabric inventory management with comprehensive fabric details';
COMMENT ON COLUMN public.fabric_master.fabric_code IS 'Unique identifier code for the fabric';
COMMENT ON COLUMN public.fabric_master.fabric_description IS 'Detailed description of the fabric';
COMMENT ON COLUMN public.fabric_master.fabric_name IS 'Name of the fabric';
COMMENT ON COLUMN public.fabric_master.type IS 'Type or category of the fabric';
COMMENT ON COLUMN public.fabric_master.color IS 'Color of the fabric';
COMMENT ON COLUMN public.fabric_master.hex IS 'Hexadecimal color code';
COMMENT ON COLUMN public.fabric_master.gsm IS 'Grams per square meter - fabric weight';
COMMENT ON COLUMN public.fabric_master.uom IS 'Unit of measure (meters, yards, etc.)';
COMMENT ON COLUMN public.fabric_master.rate IS 'Price rate per unit';
COMMENT ON COLUMN public.fabric_master.hsn_code IS 'Harmonized System of Nomenclature code for taxation';
COMMENT ON COLUMN public.fabric_master.gst IS 'Goods and Services Tax rate';
COMMENT ON COLUMN public.fabric_master.image IS 'Image URL or path for fabric visual reference';
COMMENT ON COLUMN public.fabric_master.inventory IS 'Current stock quantity';
COMMENT ON COLUMN public.fabric_master.supplier1 IS 'Primary supplier information';
COMMENT ON COLUMN public.fabric_master.supplier2 IS 'Secondary supplier information';

-- Step 8: Insert some sample data (optional - remove if not needed)
INSERT INTO public.fabric_master (
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
);

-- Step 9: Update any existing references (if needed)
-- Note: You may need to update your application code to use 'fabric_master' instead of 'fabrics' and 'fabric_variants'

-- Verification queries
SELECT 'Fabric Master table created successfully' as status;
SELECT COUNT(*) as total_fabrics FROM public.fabric_master;
