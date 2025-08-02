-- Add missing columns to product_master table
ALTER TABLE product_master 
ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS hsn_code TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Update unit_of_measure default if not set
ALTER TABLE product_master 
ALTER COLUMN unit_of_measure SET DEFAULT 'PCS';

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_product_master_code ON product_master(product_code);
CREATE INDEX IF NOT EXISTS idx_product_master_category ON product_master(category);
CREATE INDEX IF NOT EXISTS idx_product_master_status ON product_master(status);

-- Add RLS policies (if not already enabled)
ALTER TABLE product_master ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists and create new one
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON product_master;
CREATE POLICY "Allow all operations for authenticated users" ON product_master
  FOR ALL USING (auth.role() = 'authenticated');

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_product_master_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_product_master_updated_at ON product_master;
CREATE TRIGGER update_product_master_updated_at
  BEFORE UPDATE ON product_master
  FOR EACH ROW
  EXECUTE FUNCTION update_product_master_updated_at(); 