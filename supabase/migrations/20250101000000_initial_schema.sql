-- Initial Database Schema for Scissors ERP
-- This migration creates all essential tables and relationships

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table (for user management)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  gst_number TEXT,
  customer_type TEXT DEFAULT 'individual',
  status TEXT DEFAULT 'active',
  pending_amount DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for customers
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON customers;
CREATE POLICY "Allow all operations for authenticated users" ON customers
  FOR ALL USING (auth.role() = 'authenticated');

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_name TEXT NOT NULL,
  product_code TEXT UNIQUE,
  category TEXT,
  description TEXT,
  unit_of_measure TEXT DEFAULT 'PCS',
  cost_price DECIMAL(10,2),
  selling_price DECIMAL(10,2),
  hsn_code TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for products
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON products;
CREATE POLICY "Allow all operations for authenticated users" ON products
  FOR ALL USING (auth.role() = 'authenticated');

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id),
  order_date DATE DEFAULT CURRENT_DATE,
  delivery_date DATE,
  status TEXT DEFAULT 'pending',
  total_amount DECIMAL(12,2) DEFAULT 0,
  final_amount DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for orders
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON orders;
CREATE POLICY "Allow all operations for authenticated users" ON orders
  FOR ALL USING (auth.role() = 'authenticated');

-- Create order_items table
CREATE TABLE IF NOT EXISTS order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2),
  total_price DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on order_items
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for order_items
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON order_items;
CREATE POLICY "Allow all operations for authenticated users" ON order_items
  FOR ALL USING (auth.role() = 'authenticated');

-- Create company_settings table
CREATE TABLE IF NOT EXISTS company_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT DEFAULT 'Scissors ERP',
  company_logo TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  gst_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on company_settings
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for company_settings
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON company_settings;
CREATE POLICY "Allow all operations for authenticated users" ON company_settings
  FOR ALL USING (auth.role() = 'authenticated');

-- Create fabric_master table
CREATE TABLE IF NOT EXISTS fabric_master (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fabric_name TEXT NOT NULL,
  fabric_code TEXT UNIQUE,
  color TEXT,
  width DECIMAL(8,2),
  weight DECIMAL(8,2),
  price_per_meter DECIMAL(10,2),
  supplier TEXT,
  gst_rate DECIMAL(5,2) DEFAULT 0,
  status TEXT DEFAULT 'active',
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on fabric_master
ALTER TABLE fabric_master ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for fabric_master
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON fabric_master;
CREATE POLICY "Allow all operations for authenticated users" ON fabric_master
  FOR ALL USING (auth.role() = 'authenticated');

-- Create warehouse_inventory table
CREATE TABLE IF NOT EXISTS warehouse_inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID,
  fabric_id UUID REFERENCES fabric_master(id),
  quantity DECIMAL(10,2) DEFAULT 0,
  unit TEXT DEFAULT 'meters',
  location TEXT,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on warehouse_inventory
ALTER TABLE warehouse_inventory ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for warehouse_inventory
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON warehouse_inventory;
CREATE POLICY "Allow all operations for authenticated users" ON warehouse_inventory
  FOR ALL USING (auth.role() = 'authenticated');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(customer_name);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(product_name);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(product_code);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_fabric_master_code ON fabric_master(fabric_code);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_item ON warehouse_inventory(item_id);

-- Create function to generate order numbers
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  order_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 3) AS INTEGER)), 0) + 1
  INTO next_num
  FROM orders
  WHERE order_number LIKE 'OR%';
  
  order_num := 'OR' || LPAD(next_num::TEXT, 6, '0');
  RETURN order_num;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic order number generation
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_order_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_order_number ON orders;
CREATE TRIGGER trigger_set_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_order_number();

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to all tables
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_company_settings_updated_at ON company_settings;
CREATE TRIGGER update_company_settings_updated_at
  BEFORE UPDATE ON company_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fabric_master_updated_at ON fabric_master;
CREATE TRIGGER update_fabric_master_updated_at
  BEFORE UPDATE ON fabric_master
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
