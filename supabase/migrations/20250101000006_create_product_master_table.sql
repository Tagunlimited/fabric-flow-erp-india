-- Create product_master table
CREATE TABLE IF NOT EXISTS product_master (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id VARCHAR(50) UNIQUE NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  product_category VARCHAR(100),
  description TEXT,
  unit VARCHAR(20) DEFAULT 'pcs',
  current_stock DECIMAL(10,2) DEFAULT 0,
  default_price DECIMAL(10,2) DEFAULT 0,
  regular_buying_price DECIMAL(10,2) DEFAULT 0,
  wholesale_buying_price DECIMAL(10,2) DEFAULT 0,
  regular_selling_price DECIMAL(10,2) DEFAULT 0,
  mrp DECIMAL(10,2) DEFAULT 0,
  gst_rate DECIMAL(5,2) DEFAULT 0,
  weight DECIMAL(8,2) DEFAULT 0,
  brand VARCHAR(100),
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_product_master_product_id ON product_master(product_id);
CREATE INDEX IF NOT EXISTS idx_product_master_product_name ON product_master(product_name);
CREATE INDEX IF NOT EXISTS idx_product_master_category ON product_master(product_category);
CREATE INDEX IF NOT EXISTS idx_product_master_brand ON product_master(brand);
CREATE INDEX IF NOT EXISTS idx_product_master_is_active ON product_master(is_active);
CREATE INDEX IF NOT EXISTS idx_product_master_created_at ON product_master(created_at);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_product_master_updated_at 
    BEFORE UPDATE ON product_master 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert some sample data
INSERT INTO product_master (
  product_id, 
  product_name, 
  product_category, 
  description, 
  unit, 
  current_stock, 
  default_price, 
  regular_buying_price, 
  wholesale_buying_price, 
  regular_selling_price, 
  mrp, 
  gst_rate, 
  weight, 
  brand, 
  is_active
) VALUES 
  ('RM01', 'Raw Material 1', 'Raw Material', 'High quality raw material for production', 'kg', 100, 150.00, 120.00, 110.00, 180.00, 200.00, 18.00, 1.5, 'Brand A', true),
  ('RM02', 'Raw Material 2', 'Raw Material', 'Premium raw material with excellent properties', 'kg', 200, 200.00, 160.00, 150.00, 240.00, 280.00, 18.00, 2.0, 'Brand B', true),
  ('RM03', 'Raw Material 3', 'Raw Material', 'Standard raw material for general use', 'kg', 150, 120.00, 100.00, 90.00, 150.00, 180.00, 18.00, 1.2, 'Brand C', true),
  ('RM04', 'Raw Material 4', 'Raw Material', 'Specialized raw material for specific applications', 'kg', 80, 300.00, 250.00, 230.00, 360.00, 400.00, 18.00, 0.8, 'Brand D', true),
  ('RM05', 'Raw Material 5', 'Raw Material', 'Eco-friendly raw material option', 'kg', 120, 180.00, 150.00, 140.00, 220.00, 250.00, 18.00, 1.8, 'Brand E', true),
  ('RM06', 'Raw Material 6', 'Raw Material', 'High-performance raw material', 'kg', 200, 150.00, 120.00, 110.00, 180.00, 200.00, 18.00, 1.0, 'Brand F', true),
  ('FG01', 'Finished Good #1', 'Finished Good', 'Complete finished product ready for sale', 'pcs', 50, 500.00, 400.00, 380.00, 600.00, 700.00, 18.00, 2.5, 'Brand G', true)
ON CONFLICT (product_id) DO NOTHING;

-- Add RLS (Row Level Security) policies
ALTER TABLE product_master ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to view all products
CREATE POLICY "Authenticated users can view products" ON product_master
  FOR SELECT USING (auth.role() = 'authenticated');

-- Policy for authenticated users to insert products
CREATE POLICY "Authenticated users can insert products" ON product_master
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Policy for authenticated users to update products
CREATE POLICY "Authenticated users can update products" ON product_master
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Policy for authenticated users to delete products
CREATE POLICY "Authenticated users can delete products" ON product_master
  FOR DELETE USING (auth.role() = 'authenticated');
