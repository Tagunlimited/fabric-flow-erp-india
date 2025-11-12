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
-- Complete Database Schema for Scissors ERP
-- Run this in Supabase Dashboard SQL Editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================
-- 1. SUPPLIER MASTER TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS supplier_master (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    supplier_name VARCHAR(255) NOT NULL,
    supplier_code VARCHAR(50) UNIQUE,
    contact_person VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),
    gst_number VARCHAR(15),
    pan_number VARCHAR(10),
    bank_name VARCHAR(255),
    bank_account_number VARCHAR(20),
    ifsc_code VARCHAR(15),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    rating INTEGER DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
    payment_terms VARCHAR(100),
    credit_limit DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 2. PURCHASE ORDERS
-- ==============================================
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    po_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_id UUID NOT NULL REFERENCES supplier_master(id),
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery_date DATE,
    delivery_address TEXT,
    terms_conditions TEXT,
    subtotal DECIMAL(15,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'in_progress', 'completed', 'cancelled')),
    created_by UUID,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('fabric', 'item', 'product')),
    item_id UUID NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    item_image_url TEXT,
    quantity DECIMAL(10,2) NOT NULL,
    unit_price DECIMAL(15,2) NOT NULL,
    total_price DECIMAL(15,2) NOT NULL,
    received_quantity DECIMAL(10,2) DEFAULT 0,
    unit_of_measure VARCHAR(20) DEFAULT 'pcs',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 3. GRN (GOODS RECEIPT NOTE)
-- ==============================================
CREATE TABLE IF NOT EXISTS grn_master (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    grn_number VARCHAR(50) UNIQUE NOT NULL,
    po_id UUID NOT NULL REFERENCES purchase_orders(id),
    supplier_id UUID NOT NULL REFERENCES supplier_master(id),
    grn_date DATE NOT NULL DEFAULT CURRENT_DATE,
    received_date TIMESTAMPTZ DEFAULT NOW(),
    received_by UUID,
    received_at_location TEXT,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'received', 'under_inspection', 'approved', 'rejected', 'partially_approved')),
    total_items_received INTEGER DEFAULT 0,
    total_items_approved INTEGER DEFAULT 0,
    total_items_rejected INTEGER DEFAULT 0,
    total_amount_received DECIMAL(15,2) DEFAULT 0,
    total_amount_approved DECIMAL(15,2) DEFAULT 0,
    quality_inspector UUID,
    inspection_date TIMESTAMPTZ,
    inspection_notes TEXT,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grn_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    grn_id UUID NOT NULL REFERENCES grn_master(id) ON DELETE CASCADE,
    po_item_id UUID NOT NULL REFERENCES purchase_order_items(id),
    item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('fabric', 'item', 'product')),
    item_id UUID NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    ordered_quantity DECIMAL(10,2) NOT NULL,
    received_quantity DECIMAL(10,2) NOT NULL,
    approved_quantity DECIMAL(10,2) DEFAULT 0,
    rejected_quantity DECIMAL(10,2) DEFAULT 0,
    unit_price DECIMAL(15,2) NOT NULL,
    total_price DECIMAL(15,2) NOT NULL,
    unit_of_measure VARCHAR(20) DEFAULT 'pcs',
    quality_status VARCHAR(20) DEFAULT 'pending' CHECK (quality_status IN ('pending', 'passed', 'failed', 'partial')),
    quality_notes TEXT,
    batch_number VARCHAR(100),
    expiry_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 4. PRODUCTION TEAM
-- ==============================================
CREATE TABLE IF NOT EXISTS production_team (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    designation VARCHAR(100) NOT NULL,
    department VARCHAR(100),
    skill_level VARCHAR(20) DEFAULT 'beginner' CHECK (skill_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
    hourly_rate DECIMAL(10,2) DEFAULT 0,
    daily_rate DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave', 'terminated')),
    joining_date DATE,
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    supervisor_id UUID REFERENCES production_team(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 5. BOM (BILL OF MATERIALS)
-- ==============================================
CREATE TABLE IF NOT EXISTS bom_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    bom_number VARCHAR(50) UNIQUE NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    total_order_qty INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'in_production', 'completed')),
    created_by UUID,
    approved_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bom_record_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    bom_id UUID NOT NULL REFERENCES bom_records(id) ON DELETE CASCADE,
    item_name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    qty_total DECIMAL(10,2) NOT NULL,
    stock DECIMAL(10,2) DEFAULT 0,
    to_order DECIMAL(10,2) DEFAULT 0,
    unit VARCHAR(20) DEFAULT 'pcs',
    unit_price DECIMAL(10,2) DEFAULT 0,
    total_price DECIMAL(10,2) DEFAULT 0,
    supplier_id UUID REFERENCES supplier_master(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 6. ORDER BATCH ASSIGNMENTS
-- ==============================================
CREATE TABLE IF NOT EXISTS order_batch_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL,
    batch_number VARCHAR(50) NOT NULL,
    assigned_to UUID REFERENCES production_team(id),
    assigned_date DATE DEFAULT CURRENT_DATE,
    expected_completion_date DATE,
    actual_completion_date DATE,
    status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'on_hold', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 7. TAILOR MANAGEMENT
-- ==============================================
CREATE TABLE IF NOT EXISTS tailors (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tailor_name VARCHAR(255) NOT NULL,
    tailor_code VARCHAR(50) UNIQUE,
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    skill_level VARCHAR(20) DEFAULT 'beginner' CHECK (skill_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
    specialization VARCHAR(100),
    hourly_rate DECIMAL(10,2) DEFAULT 0,
    daily_rate DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave')),
    joining_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 8. INVOICES
-- ==============================================
CREATE TABLE IF NOT EXISTS invoices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id),
    order_id UUID REFERENCES orders(id),
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    subtotal DECIMAL(12,2) DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) DEFAULT 0,
    paid_amount DECIMAL(12,2) DEFAULT 0,
    balance_amount DECIMAL(12,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    description TEXT,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 9. RECEIPTS
-- ==============================================
CREATE TABLE IF NOT EXISTS receipts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    receipt_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id),
    invoice_id UUID REFERENCES invoices(id),
    receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'cash' CHECK (payment_method IN ('cash', 'cheque', 'bank_transfer', 'upi', 'card')),
    reference_number VARCHAR(100),
    notes TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'refunded')),
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 10. QUOTATIONS
-- ==============================================
CREATE TABLE IF NOT EXISTS quotations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quotation_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id),
    quotation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE,
    subtotal DECIMAL(12,2) DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotation_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    description TEXT,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- ENABLE ROW LEVEL SECURITY
-- ==============================================
ALTER TABLE supplier_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_record_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_batch_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tailors ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;

-- ==============================================
-- CREATE RLS POLICIES
-- ==============================================
-- Allow all operations for authenticated users
CREATE POLICY "Allow all operations for authenticated users" ON supplier_master FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON purchase_orders FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON purchase_order_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON grn_master FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON grn_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON production_team FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON bom_records FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON bom_record_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON order_batch_assignments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON tailors FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON invoices FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON invoice_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON receipts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON quotations FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON quotation_items FOR ALL USING (auth.role() = 'authenticated');

-- ==============================================
-- CREATE INDEXES
-- ==============================================
CREATE INDEX IF NOT EXISTS idx_supplier_master_code ON supplier_master(supplier_code);
CREATE INDEX IF NOT EXISTS idx_supplier_master_name ON supplier_master(supplier_name);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_grn_master_number ON grn_master(grn_number);
CREATE INDEX IF NOT EXISTS idx_grn_master_po ON grn_master(po_id);
CREATE INDEX IF NOT EXISTS idx_production_team_employee ON production_team(employee_id);
CREATE INDEX IF NOT EXISTS idx_bom_records_number ON bom_records(bom_number);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_receipts_number ON receipts(receipt_number);
CREATE INDEX IF NOT EXISTS idx_quotations_number ON quotations(quotation_number);

-- ==============================================
-- CREATE FUNCTIONS AND TRIGGERS
-- ==============================================
-- Function to generate unique numbers
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  po_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(po_number FROM 3) AS INTEGER)), 0) + 1
  INTO next_num
  FROM purchase_orders
  WHERE po_number LIKE 'PO%';
  
  po_num := 'PO' || LPAD(next_num::TEXT, 6, '0');
  RETURN po_num;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_grn_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  grn_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(grn_number FROM 4) AS INTEGER)), 0) + 1
  INTO next_num
  FROM grn_master
  WHERE grn_number LIKE 'GRN%';
  
  grn_num := 'GRN' || LPAD(next_num::TEXT, 6, '0');
  RETURN grn_num;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  inv_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 3) AS INTEGER)), 0) + 1
  INTO next_num
  FROM invoices
  WHERE invoice_number LIKE 'IN%';
  
  inv_num := 'IN' || LPAD(next_num::TEXT, 6, '0');
  RETURN inv_num;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  rec_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM 3) AS INTEGER)), 0) + 1
  INTO next_num
  FROM receipts
  WHERE receipt_number LIKE 'RC%';
  
  rec_num := 'RC' || LPAD(next_num::TEXT, 6, '0');
  RETURN rec_num;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_quotation_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  quo_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(quotation_number FROM 3) AS INTEGER)), 0) + 1
  INTO next_num
  FROM quotations
  WHERE quotation_number LIKE 'QT%';
  
  quo_num := 'QT' || LPAD(next_num::TEXT, 6, '0');
  RETURN quo_num;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic number generation
CREATE OR REPLACE FUNCTION set_po_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.po_number IS NULL OR NEW.po_number = '' THEN
    NEW.po_number := generate_po_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_grn_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.grn_number IS NULL OR NEW.grn_number = '' THEN
    NEW.grn_number := generate_grn_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_receipt_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.receipt_number IS NULL OR NEW.receipt_number = '' THEN
    NEW.receipt_number := generate_receipt_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_quotation_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quotation_number IS NULL OR NEW.quotation_number = '' THEN
    NEW.quotation_number := generate_quotation_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_set_po_number ON purchase_orders;
CREATE TRIGGER trigger_set_po_number
  BEFORE INSERT ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_po_number();

DROP TRIGGER IF EXISTS trigger_set_grn_number ON grn_master;
CREATE TRIGGER trigger_set_grn_number
  BEFORE INSERT ON grn_master
  FOR EACH ROW
  EXECUTE FUNCTION set_grn_number();

DROP TRIGGER IF EXISTS trigger_set_invoice_number ON invoices;
CREATE TRIGGER trigger_set_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION set_invoice_number();

DROP TRIGGER IF EXISTS trigger_set_receipt_number ON receipts;
CREATE TRIGGER trigger_set_receipt_number
  BEFORE INSERT ON receipts
  FOR EACH ROW
  EXECUTE FUNCTION set_receipt_number();

DROP TRIGGER IF EXISTS trigger_set_quotation_number ON quotations;
CREATE TRIGGER trigger_set_quotation_number
  BEFORE INSERT ON quotations
  FOR EACH ROW
  EXECUTE FUNCTION set_quotation_number();

-- Updated_at triggers
DROP TRIGGER IF EXISTS update_supplier_master_updated_at ON supplier_master;
CREATE TRIGGER update_supplier_master_updated_at
  BEFORE UPDATE ON supplier_master
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_purchase_orders_updated_at ON purchase_orders;
CREATE TRIGGER update_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_grn_master_updated_at ON grn_master;
CREATE TRIGGER update_grn_master_updated_at
  BEFORE UPDATE ON grn_master
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_production_team_updated_at ON production_team;
CREATE TRIGGER update_production_team_updated_at
  BEFORE UPDATE ON production_team
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bom_records_updated_at ON bom_records;
CREATE TRIGGER update_bom_records_updated_at
  BEFORE UPDATE ON bom_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_order_batch_assignments_updated_at ON order_batch_assignments;
CREATE TRIGGER update_order_batch_assignments_updated_at
  BEFORE UPDATE ON order_batch_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tailors_updated_at ON tailors;
CREATE TRIGGER update_tailors_updated_at
  BEFORE UPDATE ON tailors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_receipts_updated_at ON receipts;
CREATE TRIGGER update_receipts_updated_at
  BEFORE UPDATE ON receipts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_quotations_updated_at ON quotations;
CREATE TRIGGER update_quotations_updated_at
  BEFORE UPDATE ON quotations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Success message
SELECT 'Complete database schema created successfully!' as status;
-- Missing Tables Migration
-- This creates all the missing tables identified in the verification

-- ==============================================
-- 1. EMPLOYEES TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS employees (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_code VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20),
    designation VARCHAR(100),
    department VARCHAR(100),
    joining_date DATE,
    salary DECIMAL(12,2),
    address TEXT,
    emergency_contact VARCHAR(255),
    emergency_phone VARCHAR(20),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'terminated')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 2. DESIGNATIONS TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS designations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    designation_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    department VARCHAR(100),
    level INTEGER DEFAULT 1,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 3. CUSTOMER_TYPES TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS customer_types (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    discount_percentage DECIMAL(5,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 4. ITEM_MASTER TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS item_master (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    item_code VARCHAR(50) UNIQUE NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    subcategory VARCHAR(100),
    description TEXT,
    unit_of_measure VARCHAR(20) DEFAULT 'pcs',
    cost_price DECIMAL(10,2),
    selling_price DECIMAL(10,2),
    hsn_code VARCHAR(10),
    color VARCHAR(50),
    size VARCHAR(50),
    brand VARCHAR(100),
    supplier_id UUID REFERENCES supplier_master(id),
    minimum_stock_level INTEGER DEFAULT 0,
    maximum_stock_level INTEGER DEFAULT 1000,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'discontinued')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 5. WAREHOUSE_MASTER TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS warehouse_master (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    warehouse_code VARCHAR(50) UNIQUE NOT NULL,
    warehouse_name VARCHAR(255) NOT NULL,
    location TEXT,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),
    capacity DECIMAL(10,2),
    capacity_unit VARCHAR(20) DEFAULT 'sqft',
    manager_id UUID REFERENCES employees(id),
    phone VARCHAR(20),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 6. PURCHASE_ORDER_FABRIC_DETAILS TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS purchase_order_fabric_details (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    fabric_id UUID NOT NULL REFERENCES fabric_master(id),
    quantity DECIMAL(10,2) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    received_quantity DECIMAL(10,2) DEFAULT 0,
    quality_status VARCHAR(20) DEFAULT 'pending' CHECK (quality_status IN ('pending', 'passed', 'failed', 'partial')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 7. GRN_ITEMS_FABRIC_DETAILS TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS grn_items_fabric_details (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    grn_item_id UUID NOT NULL REFERENCES grn_items(id) ON DELETE CASCADE,
    fabric_id UUID NOT NULL REFERENCES fabric_master(id),
    received_quantity DECIMAL(10,2) NOT NULL,
    approved_quantity DECIMAL(10,2) DEFAULT 0,
    rejected_quantity DECIMAL(10,2) DEFAULT 0,
    quality_status VARCHAR(20) DEFAULT 'pending' CHECK (quality_status IN ('pending', 'passed', 'failed', 'partial')),
    batch_number VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 8. BOM_ITEMS TABLE (Alternative to bom_record_items)
-- ==============================================
CREATE TABLE IF NOT EXISTS bom_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    bom_id UUID NOT NULL REFERENCES bom_records(id) ON DELETE CASCADE,
    item_id UUID REFERENCES item_master(id),
    fabric_id UUID REFERENCES fabric_master(id),
    item_name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    quantity DECIMAL(10,2) NOT NULL,
    unit VARCHAR(20) DEFAULT 'pcs',
    unit_price DECIMAL(10,2) DEFAULT 0,
    total_price DECIMAL(10,2) DEFAULT 0,
    supplier_id UUID REFERENCES supplier_master(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 9. ORDER_IMAGES TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS order_images (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    image_type VARCHAR(50) DEFAULT 'reference',
    description TEXT,
    uploaded_by UUID,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 10. COMPANY_ASSETS TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS company_assets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    asset_code VARCHAR(50) UNIQUE NOT NULL,
    asset_name VARCHAR(255) NOT NULL,
    asset_type VARCHAR(100),
    category VARCHAR(100),
    description TEXT,
    purchase_date DATE,
    purchase_price DECIMAL(12,2),
    current_value DECIMAL(12,2),
    location VARCHAR(255),
    assigned_to UUID REFERENCES employees(id),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance', 'disposed')),
    warranty_expiry DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 11. ITEM_IMAGES TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS item_images (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    item_id UUID NOT NULL REFERENCES item_master(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    image_type VARCHAR(50) DEFAULT 'main',
    is_primary BOOLEAN DEFAULT false,
    description TEXT,
    uploaded_by UUID,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 12. CUSTOMER_USER_MAPPING TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS customer_user_mapping (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'customer',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(customer_id, user_id)
);

-- ==============================================
-- 13. QUOTATIONS_ITEMS TABLE (Alternative naming)
-- ==============================================
CREATE TABLE IF NOT EXISTS quotations_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    description TEXT,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 14. INVOICES_ITEMS TABLE (Alternative naming)
-- ==============================================
CREATE TABLE IF NOT EXISTS invoices_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    description TEXT,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 15. RECEIPTS_ITEMS TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS receipts_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id),
    amount DECIMAL(12,2) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- ENABLE ROW LEVEL SECURITY
-- ==============================================
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_fabric_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_items_fabric_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_user_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts_items ENABLE ROW LEVEL SECURITY;

-- ==============================================
-- CREATE RLS POLICIES
-- ==============================================
CREATE POLICY "Allow all operations for authenticated users" ON employees FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON designations FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON customer_types FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON item_master FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON warehouse_master FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON purchase_order_fabric_details FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON grn_items_fabric_details FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON bom_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON order_images FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON company_assets FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON item_images FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON customer_user_mapping FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON quotations_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON invoices_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON receipts_items FOR ALL USING (auth.role() = 'authenticated');

-- ==============================================
-- CREATE INDEXES
-- ==============================================
CREATE INDEX IF NOT EXISTS idx_employees_code ON employees(employee_code);
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);
CREATE INDEX IF NOT EXISTS idx_designations_name ON designations(designation_name);
CREATE INDEX IF NOT EXISTS idx_customer_types_name ON customer_types(type_name);
CREATE INDEX IF NOT EXISTS idx_item_master_code ON item_master(item_code);
CREATE INDEX IF NOT EXISTS idx_item_master_name ON item_master(item_name);
CREATE INDEX IF NOT EXISTS idx_warehouse_master_code ON warehouse_master(warehouse_code);
CREATE INDEX IF NOT EXISTS idx_company_assets_code ON company_assets(asset_code);
CREATE INDEX IF NOT EXISTS idx_customer_user_mapping_customer ON customer_user_mapping(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_user_mapping_user ON customer_user_mapping(user_id);

-- ==============================================
-- CREATE TRIGGERS
-- ==============================================
DROP TRIGGER IF EXISTS update_employees_updated_at ON employees;
CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_designations_updated_at ON designations;
CREATE TRIGGER update_designations_updated_at
  BEFORE UPDATE ON designations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customer_types_updated_at ON customer_types;
CREATE TRIGGER update_customer_types_updated_at
  BEFORE UPDATE ON customer_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_item_master_updated_at ON item_master;
CREATE TRIGGER update_item_master_updated_at
  BEFORE UPDATE ON item_master
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_warehouse_master_updated_at ON warehouse_master;
CREATE TRIGGER update_warehouse_master_updated_at
  BEFORE UPDATE ON warehouse_master
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_company_assets_updated_at ON company_assets;
CREATE TRIGGER update_company_assets_updated_at
  BEFORE UPDATE ON company_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customer_user_mapping_updated_at ON customer_user_mapping;
CREATE TRIGGER update_customer_user_mapping_updated_at
  BEFORE UPDATE ON customer_user_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Success message
SELECT 'Missing tables created successfully!' as status;
-- Additional Missing Tables Migration
-- Based on console errors and application requirements

-- ==============================================
-- 1. PRODUCTION_ORDERS TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS production_orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    production_number VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    assigned_to UUID REFERENCES production_team(id),
    start_date DATE,
    expected_completion_date DATE,
    actual_completion_date DATE,
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 2. QUALITY_CHECKS TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS quality_checks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    check_type VARCHAR(50) NOT NULL,
    check_date DATE NOT NULL DEFAULT CURRENT_DATE,
    checked_by UUID REFERENCES production_team(id),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'passed', 'failed', 'requires_rework')),
    score DECIMAL(3,2),
    max_score DECIMAL(3,2) DEFAULT 5.0,
    notes TEXT,
    images TEXT[], -- Array of image URLs
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 3. INVENTORY TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS inventory (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    item_id UUID REFERENCES item_master(id),
    fabric_id UUID REFERENCES fabric_master(id),
    warehouse_id UUID REFERENCES warehouse_master(id),
    stock_quantity DECIMAL(10,2) DEFAULT 0,
    reserved_quantity DECIMAL(10,2) DEFAULT 0,
    available_quantity DECIMAL(10,2) GENERATED ALWAYS AS (stock_quantity - reserved_quantity) STORED,
    unit VARCHAR(20) DEFAULT 'pcs',
    location VARCHAR(255),
    batch_number VARCHAR(100),
    expiry_date DATE,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 4. PRODUCT_CATEGORIES TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS product_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    parent_category_id UUID REFERENCES product_categories(id),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 5. SIZE_TYPES TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS size_types (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    size_name VARCHAR(50) NOT NULL UNIQUE,
    size_code VARCHAR(20) NOT NULL UNIQUE,
    category VARCHAR(100),
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 6. DISPATCH_ORDERS TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS dispatch_orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    dispatch_number VARCHAR(50) UNIQUE NOT NULL,
    dispatch_date DATE NOT NULL DEFAULT CURRENT_DATE,
    courier_name VARCHAR(255),
    tracking_number VARCHAR(100),
    delivery_address TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'dispatched', 'in_transit', 'delivered', 'returned')),
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 7. DEPARTMENTS TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS departments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    department_name VARCHAR(100) NOT NULL UNIQUE,
    department_code VARCHAR(20) UNIQUE,
    description TEXT,
    head_of_department UUID REFERENCES employees(id),
    budget DECIMAL(15,2),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 8. ORDER_LIFECYCLE_VIEW (VIEW)
-- ==============================================
CREATE OR REPLACE VIEW order_lifecycle_view AS
SELECT 
    o.id as order_id,
    o.order_number,
    o.status as current_status,
    o.created_at as order_created,
    po.created_at as production_started,
    qc.check_date as quality_checked,
    disp.dispatch_date as dispatched,
    CASE 
        WHEN o.status = 'pending' THEN 'Order Placed'
        WHEN o.status = 'in_production' THEN 'In Production'
        WHEN qc.status = 'passed' THEN 'Quality Checked'
        WHEN disp.status = 'delivered' THEN 'Delivered'
        ELSE 'In Progress'
    END as activity_type,
    CASE 
        WHEN o.status = 'pending' THEN o.created_at
        WHEN o.status = 'in_production' THEN po.created_at
        WHEN qc.status = 'passed' THEN qc.check_date::timestamp
        WHEN disp.status = 'delivered' THEN disp.dispatch_date::timestamp
        ELSE o.updated_at
    END as performed_at
FROM orders o
LEFT JOIN production_orders po ON o.id = po.order_id
LEFT JOIN quality_checks qc ON o.id = qc.order_id
LEFT JOIN dispatch_orders disp ON o.id = disp.order_id;

-- ==============================================
-- 9. UPDATE COMPANY_SETTINGS TABLE
-- ==============================================
ALTER TABLE company_settings 
ADD COLUMN IF NOT EXISTS bank_details JSONB,
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS sidebar_logo_url TEXT,
ADD COLUMN IF NOT EXISTS header_logo_url TEXT,
ADD COLUMN IF NOT EXISTS favicon_url TEXT,
ADD COLUMN IF NOT EXISTS gstin VARCHAR(15),
ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);

-- ==============================================
-- 10. UPDATE CUSTOMERS TABLE
-- ==============================================
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS company_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS contact_person VARCHAR(255);

-- ==============================================
-- ENABLE ROW LEVEL SECURITY
-- ==============================================
ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE size_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

-- ==============================================
-- CREATE RLS POLICIES
-- ==============================================
CREATE POLICY "Allow all operations for authenticated users" ON production_orders FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON quality_checks FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON inventory FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON product_categories FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON size_types FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON dispatch_orders FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all operations for authenticated users" ON departments FOR ALL USING (auth.role() = 'authenticated');

-- ==============================================
-- CREATE INDEXES
-- ==============================================
CREATE INDEX IF NOT EXISTS idx_production_orders_order ON production_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_status ON production_orders(status);
CREATE INDEX IF NOT EXISTS idx_quality_checks_order ON quality_checks(order_id);
CREATE INDEX IF NOT EXISTS idx_quality_checks_date ON quality_checks(check_date);
CREATE INDEX IF NOT EXISTS idx_inventory_item ON inventory(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_fabric ON inventory(fabric_id);
CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON inventory(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_orders_order ON dispatch_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_orders_date ON dispatch_orders(dispatch_date);
CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(department_name);

-- ==============================================
-- CREATE FUNCTIONS
-- ==============================================
CREATE OR REPLACE FUNCTION generate_production_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  prod_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(production_number FROM 4) AS INTEGER)), 0) + 1
  INTO next_num
  FROM production_orders
  WHERE production_number LIKE 'PRD%';
  
  prod_num := 'PRD' || LPAD(next_num::TEXT, 6, '0');
  RETURN prod_num;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_dispatch_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  disp_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(dispatch_number FROM 4) AS INTEGER)), 0) + 1
  INTO next_num
  FROM dispatch_orders
  WHERE dispatch_number LIKE 'DSP%';
  
  disp_num := 'DSP' || LPAD(next_num::TEXT, 6, '0');
  RETURN disp_num;
END;
$$ LANGUAGE plpgsql;

-- ==============================================
-- CREATE TRIGGERS
-- ==============================================
CREATE OR REPLACE FUNCTION set_production_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.production_number IS NULL OR NEW.production_number = '' THEN
    NEW.production_number := generate_production_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_dispatch_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.dispatch_number IS NULL OR NEW.dispatch_number = '' THEN
    NEW.dispatch_number := generate_dispatch_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_production_number ON production_orders;
CREATE TRIGGER trigger_set_production_number
  BEFORE INSERT ON production_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_production_number();

DROP TRIGGER IF EXISTS trigger_set_dispatch_number ON dispatch_orders;
CREATE TRIGGER trigger_set_dispatch_number
  BEFORE INSERT ON dispatch_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_dispatch_number();

-- Updated_at triggers
DROP TRIGGER IF EXISTS update_production_orders_updated_at ON production_orders;
CREATE TRIGGER update_production_orders_updated_at
  BEFORE UPDATE ON production_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_quality_checks_updated_at ON quality_checks;
CREATE TRIGGER update_quality_checks_updated_at
  BEFORE UPDATE ON quality_checks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_product_categories_updated_at ON product_categories;
CREATE TRIGGER update_product_categories_updated_at
  BEFORE UPDATE ON product_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_size_types_updated_at ON size_types;
CREATE TRIGGER update_size_types_updated_at
  BEFORE UPDATE ON size_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_dispatch_orders_updated_at ON dispatch_orders;
CREATE TRIGGER update_dispatch_orders_updated_at
  BEFORE UPDATE ON dispatch_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_departments_updated_at ON departments;
CREATE TRIGGER update_departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Success message
SELECT 'Additional missing tables created successfully!' as status;
/*
  # Create roles and user_roles tables

  1. New Tables
    - `roles`
      - `id` (uuid, primary key)
      - `name` (text, unique, not null)
      - `description` (text)
      - `created_at` (timestamp)
    - `user_roles`
      - `user_id` (uuid, foreign key to auth.users)
      - `role_id` (uuid, foreign key to roles)
      - `assigned_by` (uuid, foreign key to auth.users)
      - `assigned_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to manage roles

  3. Data
    - Insert default roles from user_role enum
*/

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- Create user_roles junction table
CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  assigned_by uuid,
  assigned_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Create policies for roles table
CREATE POLICY "Authenticated users can view all roles"
  ON roles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage roles"
  ON roles
  FOR ALL
  TO authenticated
  USING (true);

-- Create policies for user_roles table
CREATE POLICY "Authenticated users can view all user roles"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage user roles"
  ON user_roles
  FOR ALL
  TO authenticated
  USING (true);

-- Insert default roles based on user_role enum
INSERT INTO roles (name, description) VALUES
  ('admin', 'System Administrator'),
  ('sales', 'Sales Team Member'),
  ('production', 'Production Team Member'),
  ('quality', 'Quality Control Team Member'),
  ('dispatch', 'Dispatch Team Member'),
  ('manager', 'Manager')
ON CONFLICT (name) DO NOTHING;-- Create missing enums and fix customer_types issue
CREATE TYPE customer_type AS ENUM ('Retail', 'Wholesale', 'Corporate', 'B2B', 'B2C', 'Enterprise');

-- Create fabrics table
CREATE TABLE IF NOT EXISTS public.fabrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  gsm TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create product_categories table
CREATE TABLE IF NOT EXISTS public.product_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_name TEXT NOT NULL,
  description TEXT,
  category_image_url TEXT,
  fabrics TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create size_types table
CREATE TABLE IF NOT EXISTS public.size_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  size_name TEXT NOT NULL,
  available_sizes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Update customers table to use proper enum
ALTER TABLE public.customers 
DROP COLUMN IF EXISTS customer_types CASCADE;

-- Add customer_type column only if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'customers' 
        AND column_name = 'customer_type'
    ) THEN
        ALTER TABLE public.customers 
        ADD COLUMN customer_type customer_type DEFAULT 'Retail';
    END IF;
END $$;

-- Update orders table with new fields
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS sales_manager UUID,
ADD COLUMN IF NOT EXISTS expected_delivery_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS gst_rate NUMERIC DEFAULT 18.00,
ADD COLUMN IF NOT EXISTS gst_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_channel TEXT CHECK (payment_channel IN ('UPI', 'NEFT', 'RTGS', 'Cash')),
ADD COLUMN IF NOT EXISTS reference_id TEXT;

-- Update order_items table with new fields
ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS product_category_id UUID,
ADD COLUMN IF NOT EXISTS category_image_url TEXT,
ADD COLUMN IF NOT EXISTS reference_images TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS mockup_images TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS attachments TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS product_description TEXT,
ADD COLUMN IF NOT EXISTS fabric_id UUID,
ADD COLUMN IF NOT EXISTS gsm TEXT,
ADD COLUMN IF NOT EXISTS color TEXT,
ADD COLUMN IF NOT EXISTS remarks TEXT,
ADD COLUMN IF NOT EXISTS size_type_id UUID,
ADD COLUMN IF NOT EXISTS sizes_quantities JSONB DEFAULT '{}';

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) 
VALUES 
  ('category-images', 'category-images', true),
  ('order-images', 'order-images', true),
  ('order-attachments', 'order-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS for new tables
ALTER TABLE public.fabrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.size_types ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for new tables
CREATE POLICY "Authenticated users can view all fabrics" 
ON public.fabrics FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage fabrics" 
ON public.fabrics FOR ALL USING (true);

CREATE POLICY "Authenticated users can view all product categories" 
ON public.product_categories FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage product categories" 
ON public.product_categories FOR ALL USING (true);

CREATE POLICY "Authenticated users can view all size types" 
ON public.size_types FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage size types" 
ON public.size_types FOR ALL USING (true);

-- Create storage policies
CREATE POLICY "Category images are publicly accessible" 
ON storage.objects FOR SELECT USING (bucket_id = 'category-images');

CREATE POLICY "Users can upload category images" 
ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'category-images');

CREATE POLICY "Users can update category images" 
ON storage.objects FOR UPDATE USING (bucket_id = 'category-images');

CREATE POLICY "Order images are publicly accessible" 
ON storage.objects FOR SELECT USING (bucket_id = 'order-images');

CREATE POLICY "Users can upload order images" 
ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'order-images');

CREATE POLICY "Users can update order images" 
ON storage.objects FOR UPDATE USING (bucket_id = 'order-images');

CREATE POLICY "Users can view their order attachments" 
ON storage.objects FOR SELECT USING (bucket_id = 'order-attachments');

CREATE POLICY "Users can upload order attachments" 
ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'order-attachments');

CREATE POLICY "Users can update order attachments" 
ON storage.objects FOR UPDATE USING (bucket_id = 'order-attachments');

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_fabrics_updated_at ON public.fabrics;
CREATE TRIGGER update_fabrics_updated_at
BEFORE UPDATE ON public.fabrics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_product_categories_updated_at ON public.product_categories;
CREATE TRIGGER update_product_categories_updated_at
BEFORE UPDATE ON public.product_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_size_types_updated_at ON public.size_types;
CREATE TRIGGER update_size_types_updated_at
BEFORE UPDATE ON public.size_types
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();-- ============================================================================
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

-- Add category_id column to fabrics if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'fabrics' 
        AND column_name = 'category_id'
    ) THEN
        ALTER TABLE fabrics ADD COLUMN category_id UUID;
    END IF;
END $$;

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
-- First check if the column exists before adding the constraint
DO $$
BEGIN
    -- Only add constraint if both the column and table exist
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'fabrics' 
        AND column_name = 'category_id'
    ) AND NOT EXISTS (
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
-- Only create category_id index if the column exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'fabrics' 
        AND column_name = 'category_id'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_fabrics_category_id ON fabrics(category_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fabric_variants_fabric_id ON fabric_variants(fabric_id);

-- Success message
SELECT 'Fabrics tables ensured!' as status;

-- ============================================================================
-- CONSOLIDATED MIGRATION: Add All Missing Tables
-- Generated: October 8, 2025
-- Description: Adds all 35 missing tables to complete the database schema
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PART 1: WAREHOUSE MANAGEMENT SYSTEM (7 Tables)
-- ============================================================================

-- Create location type enum for bins
DO $$ BEGIN
    CREATE TYPE location_type AS ENUM ('RECEIVING_ZONE', 'STORAGE', 'DISPATCH_ZONE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Warehouses table (root of hierarchy)
CREATE TABLE IF NOT EXISTS warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT DEFAULT 'India',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Floors table
CREATE TABLE IF NOT EXISTS floors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    floor_number INTEGER NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(warehouse_id, floor_number)
);

-- 3. Racks table
CREATE TABLE IF NOT EXISTS racks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    rack_code TEXT NOT NULL,
    description TEXT,
    capacity DECIMAL(10,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(floor_id, rack_code)
);

-- 4. Bins table
CREATE TABLE IF NOT EXISTS bins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rack_id UUID NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
    bin_code TEXT NOT NULL,
    location_type location_type NOT NULL DEFAULT 'RECEIVING_ZONE',
    max_capacity DECIMAL(10,2) DEFAULT 0,
    current_capacity DECIMAL(10,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    dimensions JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(rack_id, bin_code)
);

-- 5. Warehouse Inventory table
CREATE TABLE IF NOT EXISTS warehouse_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID REFERENCES warehouses(id),
    bin_id UUID REFERENCES bins(id),
    item_id UUID,
    fabric_id UUID REFERENCES fabrics(id),
    quantity DECIMAL(10,2) DEFAULT 0,
    reserved_quantity DECIMAL(10,2) DEFAULT 0,
    available_quantity DECIMAL(10,2) GENERATED ALWAYS AS (quantity - reserved_quantity) STORED,
    unit TEXT DEFAULT 'meters',
    batch_number TEXT,
    location TEXT,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Warehouse Master table (legacy compatibility)
CREATE TABLE IF NOT EXISTS warehouse_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_code VARCHAR(50) UNIQUE NOT NULL,
    warehouse_name VARCHAR(255) NOT NULL,
    location TEXT,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),
    capacity DECIMAL(10,2),
    capacity_unit VARCHAR(20) DEFAULT 'sqft',
    manager_id UUID REFERENCES employees(id),
    phone VARCHAR(20),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Inventory Movements table
CREATE TABLE IF NOT EXISTS inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN ('in', 'out', 'transfer', 'adjustment')),
    item_id UUID,
    fabric_id UUID REFERENCES fabrics(id),
    from_warehouse_id UUID REFERENCES warehouses(id),
    to_warehouse_id UUID REFERENCES warehouses(id),
    from_bin_id UUID REFERENCES bins(id),
    to_bin_id UUID REFERENCES bins(id),
    quantity DECIMAL(10,2) NOT NULL,
    unit TEXT,
    reference_type VARCHAR(50),
    reference_id UUID,
    notes TEXT,
    moved_by UUID,
    movement_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 2: GRN (GOODS RECEIPT NOTE) SYSTEM (6 Tables)
-- ============================================================================

-- 1. GRN Master table
CREATE TABLE IF NOT EXISTS grn_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_number VARCHAR(50) UNIQUE NOT NULL,
    po_id UUID NOT NULL REFERENCES purchase_orders(id),
    supplier_id UUID NOT NULL REFERENCES supplier_master(id),
    grn_date DATE NOT NULL DEFAULT CURRENT_DATE,
    received_date TIMESTAMPTZ DEFAULT NOW(),
    received_by UUID,
    received_at_location TEXT,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'received', 'under_inspection', 'approved', 'rejected', 'partially_approved')),
    total_items_received INTEGER DEFAULT 0,
    total_items_approved INTEGER DEFAULT 0,
    total_items_rejected INTEGER DEFAULT 0,
    total_amount_received DECIMAL(15,2) DEFAULT 0,
    total_amount_approved DECIMAL(15,2) DEFAULT 0,
    quality_inspector UUID,
    inspection_date TIMESTAMPTZ,
    inspection_notes TEXT,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. GRN Items table
CREATE TABLE IF NOT EXISTS grn_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id UUID NOT NULL REFERENCES grn_master(id) ON DELETE CASCADE,
    po_item_id UUID NOT NULL REFERENCES purchase_order_items(id),
    item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('fabric', 'item', 'product')),
    item_id UUID NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    item_image_url TEXT,
    ordered_quantity DECIMAL(10,2) NOT NULL,
    received_quantity DECIMAL(10,2) NOT NULL,
    approved_quantity DECIMAL(10,2) DEFAULT 0,
    rejected_quantity DECIMAL(10,2) DEFAULT 0,
    unit_of_measure VARCHAR(20) DEFAULT 'pcs',
    unit_price DECIMAL(15,2) NOT NULL,
    total_price DECIMAL(15,2) NOT NULL,
    gst_rate DECIMAL(5,2) DEFAULT 0,
    gst_amount DECIMAL(15,2) DEFAULT 0,
    line_total DECIMAL(15,2) NOT NULL,
    quality_status VARCHAR(20) DEFAULT 'pending' CHECK (quality_status IN ('pending', 'approved', 'rejected', 'damaged')),
    batch_number VARCHAR(100),
    expiry_date DATE,
    condition_notes TEXT,
    inspection_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. GRN Items Fabric Details table
CREATE TABLE IF NOT EXISTS grn_items_fabric_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_item_id UUID NOT NULL REFERENCES grn_items(id) ON DELETE CASCADE,
    fabric_id UUID NOT NULL REFERENCES fabrics(id),
    received_quantity DECIMAL(10,2) NOT NULL,
    approved_quantity DECIMAL(10,2) DEFAULT 0,
    rejected_quantity DECIMAL(10,2) DEFAULT 0,
    quality_status VARCHAR(20) DEFAULT 'pending' CHECK (quality_status IN ('pending', 'passed', 'failed', 'partial')),
    batch_number VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. GRN Quality Inspections table
CREATE TABLE IF NOT EXISTS grn_quality_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_item_id UUID NOT NULL REFERENCES grn_items(id) ON DELETE CASCADE,
    inspection_type VARCHAR(50) NOT NULL,
    inspection_criteria TEXT,
    expected_result TEXT,
    actual_result TEXT,
    inspection_status VARCHAR(20) DEFAULT 'pending' CHECK (inspection_status IN ('pending', 'passed', 'failed', 'conditional')),
    inspector_id UUID,
    inspection_date TIMESTAMPTZ DEFAULT NOW(),
    inspection_notes TEXT,
    photos_urls TEXT[],
    test_certificates_urls TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. GRN Discrepancies table
CREATE TABLE IF NOT EXISTS grn_discrepancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id UUID NOT NULL REFERENCES grn_master(id) ON DELETE CASCADE,
    grn_item_id UUID REFERENCES grn_items(id) ON DELETE CASCADE,
    discrepancy_type VARCHAR(50) NOT NULL CHECK (discrepancy_type IN ('quantity_short', 'quantity_excess', 'quality_issue', 'damage', 'wrong_item', 'missing_documentation')),
    description TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    impact_on_payment BOOLEAN DEFAULT false,
    resolution_status VARCHAR(20) DEFAULT 'open' CHECK (resolution_status IN ('open', 'in_progress', 'resolved', 'escalated')),
    resolution_notes TEXT,
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. GRN Attachments table
CREATE TABLE IF NOT EXISTS grn_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id UUID NOT NULL REFERENCES grn_master(id) ON DELETE CASCADE,
    attachment_type VARCHAR(50) NOT NULL CHECK (attachment_type IN ('delivery_challan', 'test_certificate', 'quality_report', 'photo', 'other')),
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100),
    uploaded_by UUID,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 3: TAILOR MANAGEMENT SYSTEM (5 Tables)
-- ============================================================================

-- Create enums for tailor management
DO $$ BEGIN
    CREATE TYPE tailor_type AS ENUM ('single_needle', 'overlock_flatlock');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE skill_level AS ENUM ('beginner', 'intermediate', 'advanced', 'expert');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Batches table
CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_name VARCHAR(100) NOT NULL UNIQUE,
    batch_code VARCHAR(20) UNIQUE NOT NULL,
    batch_leader_id UUID,
    batch_leader_name TEXT,
    batch_leader_avatar TEXT,
    max_capacity INTEGER DEFAULT 10,
    current_capacity INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'full')),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tailors table
CREATE TABLE IF NOT EXISTS tailors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tailor_code VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    skill_level skill_level DEFAULT 'beginner',
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    is_batch_leader BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave', 'terminated')),
    date_of_birth DATE,
    gender VARCHAR(10) CHECK (gender IN ('Male', 'Female', 'Other')),
    personal_phone VARCHAR(15),
    personal_email VARCHAR(255),
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(15),
    address_line1 TEXT,
    address_line2 TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),
    country VARCHAR(100) DEFAULT 'India',
    joining_date DATE DEFAULT CURRENT_DATE,
    employment_type VARCHAR(20) DEFAULT 'Full-time' CHECK (employment_type IN ('Full-time', 'Part-time', 'Contract', 'Intern')),
    per_piece_rate DECIMAL(10,2),
    salary DECIMAL(10,2),
    work_hours_per_day INTEGER DEFAULT 8,
    total_orders_completed INTEGER DEFAULT 0,
    average_completion_time DECIMAL(5,2),
    quality_rating DECIMAL(3,2) DEFAULT 0.0,
    efficiency_score DECIMAL(3,2) DEFAULT 0.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

-- 3. Tailor Assignments table
CREATE TABLE IF NOT EXISTS tailor_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tailor_id UUID REFERENCES tailors(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'on_hold', 'cancelled')),
    priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    quality_rating DECIMAL(3,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tailor Skills table
CREATE TABLE IF NOT EXISTS tailor_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tailor_id UUID REFERENCES tailors(id) ON DELETE CASCADE,
    skill_name VARCHAR(100) NOT NULL,
    proficiency_level skill_level NOT NULL,
    years_of_experience DECIMAL(3,1) DEFAULT 0.0,
    certified BOOLEAN DEFAULT FALSE,
    certification_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tailor_id, skill_name)
);

-- 5. Tailor Attendance table
CREATE TABLE IF NOT EXISTS tailor_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tailor_id UUID REFERENCES tailors(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    hours_worked DECIMAL(4,2) DEFAULT 0.0,
    status VARCHAR(20) DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'half_day', 'leave')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tailor_id, attendance_date)
);

-- Update batches table to reference tailors
ALTER TABLE batches 
ADD CONSTRAINT batches_batch_leader_id_fkey 
FOREIGN KEY (batch_leader_id) REFERENCES tailors(id) ON DELETE SET NULL;

-- ============================================================================
-- PART 4: ORDER BATCH MANAGEMENT (2 Tables)
-- ============================================================================

-- 1. Order Batch Assignments table
CREATE TABLE IF NOT EXISTS order_batch_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES batches(id),
    batch_name TEXT,
    batch_leader_id UUID REFERENCES tailors(id),
    batch_leader_name TEXT,
    batch_leader_avatar TEXT,
    assigned_date DATE DEFAULT CURRENT_DATE,
    expected_completion_date DATE,
    actual_completion_date DATE,
    status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'on_hold', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    total_quantity INTEGER DEFAULT 0,
    completed_quantity INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Order Batch Size Distributions table
CREATE TABLE IF NOT EXISTS order_batch_size_distributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_batch_assignment_id UUID NOT NULL REFERENCES order_batch_assignments(id) ON DELETE CASCADE,
    size_name VARCHAR(20) NOT NULL,
    assigned_quantity INTEGER NOT NULL DEFAULT 0,
    picked_quantity INTEGER DEFAULT 0,
    completed_quantity INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 5: DISPATCH DETAILS (1 Table)
-- ============================================================================

-- Dispatch Order Items table
CREATE TABLE IF NOT EXISTS dispatch_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_order_id UUID NOT NULL REFERENCES dispatch_orders(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id),
    size_name VARCHAR(20) NOT NULL,
    quantity INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 6: FABRIC TRACKING SYSTEM (5 Tables)
-- ============================================================================

-- 1. Fabric Master table (legacy support)
CREATE TABLE IF NOT EXISTS fabric_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- 2. Fabric Inventory table
CREATE TABLE IF NOT EXISTS fabric_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fabric_id UUID REFERENCES fabrics(id),
    warehouse_id UUID REFERENCES warehouses(id),
    bin_id UUID REFERENCES bins(id),
    quantity DECIMAL(10,2) DEFAULT 0,
    reserved_quantity DECIMAL(10,2) DEFAULT 0,
    available_quantity DECIMAL(10,2) GENERATED ALWAYS AS (quantity - reserved_quantity) STORED,
    unit TEXT DEFAULT 'meters',
    batch_number TEXT,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Fabric Storage Zones table
CREATE TABLE IF NOT EXISTS fabric_storage_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_name TEXT NOT NULL,
    zone_code TEXT UNIQUE NOT NULL,
    warehouse_id UUID REFERENCES warehouses(id),
    capacity DECIMAL(10,2),
    current_usage DECIMAL(10,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Fabric Picking Records table
CREATE TABLE IF NOT EXISTS fabric_picking_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id),
    fabric_id UUID REFERENCES fabrics(id),
    picked_quantity DECIMAL(10,2) NOT NULL,
    unit TEXT DEFAULT 'meters',
    picked_by UUID,
    picked_at TIMESTAMPTZ DEFAULT NOW(),
    source_warehouse_id UUID REFERENCES warehouses(id),
    source_bin_id UUID REFERENCES bins(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Fabric Usage Records table
CREATE TABLE IF NOT EXISTS fabric_usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id),
    fabric_id UUID REFERENCES fabrics(id),
    planned_quantity DECIMAL(10,2),
    actual_quantity DECIMAL(10,2),
    wastage_quantity DECIMAL(10,2),
    unit TEXT DEFAULT 'meters',
    used_by UUID,
    used_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 7: ORGANIZATION TABLES (2 Tables)
-- ============================================================================

-- 1. Designations table
CREATE TABLE IF NOT EXISTS designations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    designation_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    department VARCHAR(100),
    level INTEGER DEFAULT 1,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Designation Departments table (many-to-many)
CREATE TABLE IF NOT EXISTS designation_departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    designation_id UUID REFERENCES designations(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(designation_id, department_id)
);

-- ============================================================================
-- PART 8: ADDITIONAL TABLES (7 Tables)
-- ============================================================================

-- 1. Customer Types table
CREATE TABLE IF NOT EXISTS customer_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    discount_percentage DECIMAL(5,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Company Assets table
CREATE TABLE IF NOT EXISTS company_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_code VARCHAR(50) UNIQUE NOT NULL,
    asset_name VARCHAR(255) NOT NULL,
    asset_type VARCHAR(100),
    category VARCHAR(100),
    description TEXT,
    purchase_date DATE,
    purchase_price DECIMAL(12,2),
    current_value DECIMAL(12,2),
    location VARCHAR(255),
    assigned_to UUID REFERENCES employees(id),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance', 'disposed')),
    warranty_expiry DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Item Images table
CREATE TABLE IF NOT EXISTS item_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES item_master(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    image_type VARCHAR(50) DEFAULT 'main',
    is_primary BOOLEAN DEFAULT false,
    description TEXT,
    uploaded_by UUID,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Order Images table
CREATE TABLE IF NOT EXISTS order_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    image_type VARCHAR(50) DEFAULT 'reference',
    description TEXT,
    uploaded_by UUID,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Order Activities table
CREATE TABLE IF NOT EXISTS order_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,
    activity_description TEXT,
    performed_by UUID,
    performed_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Receipts Items table
CREATE TABLE IF NOT EXISTS receipts_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id),
    amount DECIMAL(12,2) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Purchase Order Fabric Details table
CREATE TABLE IF NOT EXISTS purchase_order_fabric_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    fabric_id UUID NOT NULL REFERENCES fabrics(id),
    quantity DECIMAL(10,2) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    received_quantity DECIMAL(10,2) DEFAULT 0,
    quality_status VARCHAR(20) DEFAULT 'pending' CHECK (quality_status IN ('pending', 'passed', 'failed', 'partial')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Warehouse indexes (with column existence checks)
DO $$
BEGIN
    -- Only create index on code column if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'warehouses' 
          AND column_name = 'code'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_warehouses_code ON warehouses(code);
    END IF;
    
    -- Only create index on is_active column if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'warehouses' 
          AND column_name = 'is_active'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_warehouses_active ON warehouses(is_active);
    END IF;
END $$;

-- Warehouse hierarchy indexes (conditional)
DO $$
BEGIN
    -- floors indexes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'floors') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'floors' AND column_name = 'warehouse_id') THEN
            CREATE INDEX IF NOT EXISTS idx_floors_warehouse_id ON floors(warehouse_id);
        END IF;
    END IF;
    
    -- racks indexes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'racks') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'racks' AND column_name = 'floor_id') THEN
            CREATE INDEX IF NOT EXISTS idx_racks_floor_id ON racks(floor_id);
        END IF;
    END IF;
    
    -- bins indexes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bins') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bins' AND column_name = 'rack_id') THEN
            CREATE INDEX IF NOT EXISTS idx_bins_rack_id ON bins(rack_id);
        END IF;
        
        -- Only create location_type index if column exists
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'bins' AND column_name = 'location_type'
        ) THEN
            CREATE INDEX IF NOT EXISTS idx_bins_location_type ON bins(location_type);
        END IF;
    END IF;
    
    -- warehouse_inventory indexes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'warehouse_inventory') THEN
        -- Only create warehouse_id index if column exists
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'warehouse_inventory' AND column_name = 'warehouse_id') THEN
            CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_warehouse ON warehouse_inventory(warehouse_id);
        END IF;
        
        -- Only create item_id index if column exists
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'warehouse_inventory' AND column_name = 'item_id') THEN
            CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_item ON warehouse_inventory(item_id);
        END IF;
        
        -- Only create fabric_id index if column exists
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'warehouse_inventory' AND column_name = 'fabric_id') THEN
            CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_fabric ON warehouse_inventory(fabric_id);
        END IF;
    END IF;
    
    -- inventory_movements indexes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_movements') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_movements' AND column_name = 'movement_type') THEN
            CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements(movement_type);
        END IF;
    END IF;
END $$;

-- All remaining indexes (conditional on table/column existence)
DO $$
BEGIN
    -- GRN indexes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'grn_master') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'grn_master' AND column_name = 'grn_number') THEN
            CREATE INDEX IF NOT EXISTS idx_grn_master_grn_number ON grn_master(grn_number);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'grn_master' AND column_name = 'po_id') THEN
            CREATE INDEX IF NOT EXISTS idx_grn_master_po_id ON grn_master(po_id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'grn_master' AND column_name = 'supplier_id') THEN
            CREATE INDEX IF NOT EXISTS idx_grn_master_supplier_id ON grn_master(supplier_id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'grn_master' AND column_name = 'status') THEN
            CREATE INDEX IF NOT EXISTS idx_grn_master_status ON grn_master(status);
        END IF;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'grn_items') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'grn_items' AND column_name = 'grn_id') THEN
            CREATE INDEX IF NOT EXISTS idx_grn_items_grn_id ON grn_items(grn_id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'grn_items' AND column_name = 'po_item_id') THEN
            CREATE INDEX IF NOT EXISTS idx_grn_items_po_item_id ON grn_items(po_item_id);
        END IF;
    END IF;
    
    -- Tailor indexes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'batches') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'batches' AND column_name = 'batch_code') THEN
            CREATE INDEX IF NOT EXISTS idx_batches_code ON batches(batch_code);
        END IF;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tailors') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tailors' AND column_name = 'tailor_code') THEN
            CREATE INDEX IF NOT EXISTS idx_tailors_code ON tailors(tailor_code);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tailors' AND column_name = 'batch_id') THEN
            CREATE INDEX IF NOT EXISTS idx_tailors_batch_id ON tailors(batch_id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tailors' AND column_name = 'status') THEN
            CREATE INDEX IF NOT EXISTS idx_tailors_status ON tailors(status);
        END IF;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tailor_assignments') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tailor_assignments' AND column_name = 'tailor_id') THEN
            CREATE INDEX IF NOT EXISTS idx_tailor_assignments_tailor ON tailor_assignments(tailor_id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tailor_assignments' AND column_name = 'order_id') THEN
            CREATE INDEX IF NOT EXISTS idx_tailor_assignments_order ON tailor_assignments(order_id);
        END IF;
    END IF;
    
    -- Order batch indexes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_batch_assignments') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_batch_assignments' AND column_name = 'order_id') THEN
            CREATE INDEX IF NOT EXISTS idx_order_batch_assignments_order ON order_batch_assignments(order_id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_batch_assignments' AND column_name = 'batch_id') THEN
            CREATE INDEX IF NOT EXISTS idx_order_batch_assignments_batch ON order_batch_assignments(batch_id);
        END IF;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_batch_size_distributions') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_batch_size_distributions' AND column_name = 'order_batch_assignment_id') THEN
            CREATE INDEX IF NOT EXISTS idx_order_batch_size_dist_assignment ON order_batch_size_distributions(order_batch_assignment_id);
        END IF;
    END IF;
    
    -- Dispatch indexes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dispatch_order_items') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dispatch_order_items' AND column_name = 'dispatch_order_id') THEN
            CREATE INDEX IF NOT EXISTS idx_dispatch_order_items_dispatch ON dispatch_order_items(dispatch_order_id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dispatch_order_items' AND column_name = 'order_id') THEN
            CREATE INDEX IF NOT EXISTS idx_dispatch_order_items_order ON dispatch_order_items(order_id);
        END IF;
    END IF;
    
    -- Fabric indexes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fabric_master') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'fabric_code') THEN
            CREATE INDEX IF NOT EXISTS idx_fabric_master_code ON fabric_master(fabric_code);
        END IF;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fabric_inventory') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_inventory' AND column_name = 'fabric_id') THEN
            CREATE INDEX IF NOT EXISTS idx_fabric_inventory_fabric ON fabric_inventory(fabric_id);
        END IF;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fabric_picking_records') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_picking_records' AND column_name = 'order_id') THEN
            CREATE INDEX IF NOT EXISTS idx_fabric_picking_order ON fabric_picking_records(order_id);
        END IF;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fabric_usage_records') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_usage_records' AND column_name = 'order_id') THEN
            CREATE INDEX IF NOT EXISTS idx_fabric_usage_order ON fabric_usage_records(order_id);
        END IF;
    END IF;
    
    -- Other indexes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'designations') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'designations' AND column_name = 'designation_name') THEN
            CREATE INDEX IF NOT EXISTS idx_designations_name ON designations(designation_name);
        END IF;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_types') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customer_types' AND column_name = 'type_name') THEN
            CREATE INDEX IF NOT EXISTS idx_customer_types_name ON customer_types(type_name);
        END IF;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_assets') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_assets' AND column_name = 'asset_code') THEN
            CREATE INDEX IF NOT EXISTS idx_company_assets_code ON company_assets(asset_code);
        END IF;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_activities') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_activities' AND column_name = 'order_id') THEN
            CREATE INDEX IF NOT EXISTS idx_order_activities_order ON order_activities(order_id);
        END IF;
    END IF;
END $$;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE racks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bins ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_items_fabric_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_quality_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_discrepancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tailors ENABLE ROW LEVEL SECURITY;
ALTER TABLE tailor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tailor_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE tailor_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_batch_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_batch_size_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_storage_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_picking_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE designation_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_fabric_details ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow all for authenticated users)
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'warehouses', 'floors', 'racks', 'bins', 'warehouse_inventory', 'warehouse_master', 'inventory_movements',
        'grn_master', 'grn_items', 'grn_items_fabric_details', 'grn_quality_inspections', 'grn_discrepancies', 'grn_attachments',
        'batches', 'tailors', 'tailor_assignments', 'tailor_skills', 'tailor_attendance',
        'order_batch_assignments', 'order_batch_size_distributions', 'dispatch_order_items',
        'fabric_master', 'fabric_inventory', 'fabric_storage_zones', 'fabric_picking_records', 'fabric_usage_records',
        'designations', 'designation_departments', 'customer_types', 'company_assets',
        'item_images', 'order_images', 'order_activities', 'receipts_items', 'purchase_order_fabric_details'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON %I', tbl);
        EXECUTE format('CREATE POLICY "Allow all operations for authenticated users" ON %I FOR ALL USING (auth.role() = ''authenticated'')', tbl);
    END LOOP;
END $$;

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'warehouses', 'floors', 'racks', 'bins', 'warehouse_master',
        'grn_master', 'grn_items', 'batches', 'tailors', 'tailor_assignments', 'tailor_skills', 'tailor_attendance',
        'order_batch_assignments', 'order_batch_size_distributions', 'fabric_master', 'fabric_inventory', 'fabric_storage_zones',
        'designations', 'customer_types', 'company_assets'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON %I', tbl, tbl);
        EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', tbl, tbl);
    END LOOP;
END $$;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Generate GRN number
CREATE OR REPLACE FUNCTION generate_grn_number()
RETURNS TEXT AS $$
DECLARE
    next_num INTEGER;
    grn_num TEXT;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(grn_number FROM 5) AS INTEGER)), 0) + 1
    INTO next_num
    FROM grn_master
    WHERE grn_number LIKE 'GRN-%';
    
    grn_num := 'GRN-' || LPAD(next_num::TEXT, 6, '0');
    RETURN grn_num;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-set GRN number
CREATE OR REPLACE FUNCTION set_grn_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.grn_number IS NULL OR NEW.grn_number = '' THEN
        NEW.grn_number := generate_grn_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_grn_number ON grn_master;
CREATE TRIGGER trigger_set_grn_number
    BEFORE INSERT ON grn_master
    FOR EACH ROW
    EXECUTE FUNCTION set_grn_number();

-- Update batch capacity when tailors are added/removed
CREATE OR REPLACE FUNCTION update_batch_capacity()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE batches 
        SET current_capacity = (
            SELECT COUNT(*) 
            FROM tailors 
            WHERE batch_id = NEW.batch_id AND status = 'active'
        )
        WHERE id = NEW.batch_id;
    END IF;
    
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.batch_id IS DISTINCT FROM NEW.batch_id) THEN
        UPDATE batches 
        SET current_capacity = (
            SELECT COUNT(*) 
            FROM tailors 
            WHERE batch_id = OLD.batch_id AND status = 'active'
        )
        WHERE id = OLD.batch_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_batch_capacity ON tailors;
CREATE TRIGGER trigger_update_batch_capacity
    AFTER INSERT OR UPDATE OR DELETE ON tailors
    FOR EACH ROW
    EXECUTE FUNCTION update_batch_capacity();

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

SELECT 'Successfully added all 35 missing tables to complete the database schema!' as status;

-- Migration: Restructure Fabric Master Table
-- This migration drops the existing fabrics and fabric_variants tables
-- and creates a new comprehensive fabric_master table

-- Step 1: Drop existing tables and their dependencies
DROP TABLE IF EXISTS public.fabric_variants CASCADE;
DROP TABLE IF EXISTS public.fabrics CASCADE;

-- Step 2: Create the new fabric_master table with all required fields
CREATE TABLE IF NOT EXISTS public.fabric_master (
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

-- Step 3: Create indexes for better performance (with column checks)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'fabric_code') THEN
        CREATE INDEX IF NOT EXISTS idx_fabric_master_code ON public.fabric_master(fabric_code);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'fabric_name') THEN
        CREATE INDEX IF NOT EXISTS idx_fabric_master_name ON public.fabric_master(fabric_name);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'type') THEN
        CREATE INDEX IF NOT EXISTS idx_fabric_master_type ON public.fabric_master(type);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'color') THEN
        CREATE INDEX IF NOT EXISTS idx_fabric_master_color ON public.fabric_master(color);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabric_master' AND column_name = 'status') THEN
        CREATE INDEX IF NOT EXISTS idx_fabric_master_status ON public.fabric_master(status);
    END IF;
END $$;

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
DROP TRIGGER IF EXISTS update_fabric_master_updated_at ON public.fabric_master;
CREATE TRIGGER update_fabric_master_updated_at
BEFORE UPDATE ON public.fabric_master
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Step 7: Add comments for documentation (with column checks and exception handling)
DO $$
BEGIN
    -- Table comment (with exception handling)
    BEGIN
        EXECUTE 'COMMENT ON TABLE public.fabric_master IS ''Master table for fabric inventory management with comprehensive fabric details''';
    EXCEPTION WHEN OTHERS THEN NULL; END;
    
    -- Column comments (only if columns exist, with exception handling)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fabric_master' AND column_name = 'fabric_code') THEN
        BEGIN EXECUTE 'COMMENT ON COLUMN public.fabric_master.fabric_code IS ''Unique identifier code for the fabric''';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fabric_master' AND column_name = 'fabric_description') THEN
        BEGIN EXECUTE 'COMMENT ON COLUMN public.fabric_master.fabric_description IS ''Detailed description of the fabric''';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fabric_master' AND column_name = 'fabric_name') THEN
        BEGIN EXECUTE 'COMMENT ON COLUMN public.fabric_master.fabric_name IS ''Name of the fabric''';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fabric_master' AND column_name = 'type') THEN
        BEGIN EXECUTE 'COMMENT ON COLUMN public.fabric_master.type IS ''Type or category of the fabric''';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fabric_master' AND column_name = 'color') THEN
        BEGIN EXECUTE 'COMMENT ON COLUMN public.fabric_master.color IS ''Color of the fabric''';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fabric_master' AND column_name = 'hex') THEN
        BEGIN EXECUTE 'COMMENT ON COLUMN public.fabric_master.hex IS ''Hexadecimal color code''';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fabric_master' AND column_name = 'gsm') THEN
        BEGIN EXECUTE 'COMMENT ON COLUMN public.fabric_master.gsm IS ''Grams per square meter - fabric weight''';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fabric_master' AND column_name = 'uom') THEN
        BEGIN EXECUTE 'COMMENT ON COLUMN public.fabric_master.uom IS ''Unit of measure (meters, yards, etc.)''';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fabric_master' AND column_name = 'rate') THEN
        BEGIN EXECUTE 'COMMENT ON COLUMN public.fabric_master.rate IS ''Price rate per unit''';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fabric_master' AND column_name = 'hsn_code') THEN
        BEGIN EXECUTE 'COMMENT ON COLUMN public.fabric_master.hsn_code IS ''Harmonized System of Nomenclature code for taxation''';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fabric_master' AND column_name = 'gst') THEN
        BEGIN EXECUTE 'COMMENT ON COLUMN public.fabric_master.gst IS ''Goods and Services Tax rate''';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fabric_master' AND column_name = 'image') THEN
        BEGIN EXECUTE 'COMMENT ON COLUMN public.fabric_master.image IS ''Image URL or path for fabric visual reference''';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fabric_master' AND column_name = 'inventory') THEN
        BEGIN EXECUTE 'COMMENT ON COLUMN public.fabric_master.inventory IS ''Current stock quantity''';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fabric_master' AND column_name = 'supplier1') THEN
        BEGIN EXECUTE 'COMMENT ON COLUMN public.fabric_master.supplier1 IS ''Primary supplier information''';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fabric_master' AND column_name = 'supplier2') THEN
        BEGIN EXECUTE 'COMMENT ON COLUMN public.fabric_master.supplier2 IS ''Secondary supplier information''';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
EXCEPTION
    WHEN OTHERS THEN NULL; -- Silently skip all comment errors
END $$;
-- Create branding_types table
CREATE TABLE IF NOT EXISTS public.branding_types (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    scope VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better performance (with column checks)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branding_types' AND column_name = 'name') THEN
        CREATE INDEX IF NOT EXISTS idx_branding_types_name ON public.branding_types(name);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branding_types' AND column_name = 'scope') THEN
        CREATE INDEX IF NOT EXISTS idx_branding_types_scope ON public.branding_types(scope);
    END IF;
END $$;

-- Add RLS policies
ALTER TABLE public.branding_types ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to read branding types
CREATE POLICY "Allow authenticated users to read branding types" 
ON public.branding_types 
FOR SELECT 
TO authenticated 
USING (true);

-- Policy for authenticated users to insert branding types
CREATE POLICY "Allow authenticated users to insert branding types" 
ON public.branding_types 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Policy for authenticated users to update branding types
CREATE POLICY "Allow authenticated users to update branding types" 
ON public.branding_types 
FOR UPDATE 
TO authenticated 
USING (true);

-- Policy for authenticated users to delete branding types
CREATE POLICY "Allow authenticated users to delete branding types" 
ON public.branding_types 
FOR DELETE 
TO authenticated 
USING (true);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_branding_types_updated_at ON public.branding_types;
CREATE TRIGGER update_branding_types_updated_at 
    BEFORE UPDATE ON public.branding_types 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
-- ============================================================================
-- SIDEBAR PERMISSIONS SYSTEM MIGRATION
-- This migration creates a comprehensive role-based sidebar access control system
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE MISSING TABLES
-- ============================================================================

-- 1. Create sidebar_items table if it doesn't exist
CREATE TABLE IF NOT EXISTS sidebar_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    url TEXT,
    icon TEXT NOT NULL, -- Icon name from Lucide React
    parent_id UUID REFERENCES sidebar_items(id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create role_sidebar_permissions table if it doesn't exist
CREATE TABLE IF NOT EXISTS role_sidebar_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    sidebar_item_id UUID NOT NULL REFERENCES sidebar_items(id) ON DELETE CASCADE,
    can_view BOOLEAN DEFAULT true,
    can_edit BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create user_sidebar_permissions table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_sidebar_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sidebar_item_id UUID NOT NULL REFERENCES sidebar_items(id) ON DELETE CASCADE,
    can_view BOOLEAN DEFAULT true,
    can_edit BOOLEAN DEFAULT false,
    is_override BOOLEAN DEFAULT false, -- True if this overrides role permissions
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 2: INSERT DEFAULT SIDEBAR ITEMS
-- ============================================================================

-- Insert main sidebar items
INSERT INTO sidebar_items (title, url, icon, sort_order) VALUES
('Dashboard', '/', 'Home', 1),
('CRM', NULL, 'Users', 2),
('Orders', '/orders', 'ShoppingCart', 3),
('Accounts', NULL, 'Calculator', 4),
('Design & Printing', '/design', 'Palette', 5),
('Procurement', NULL, 'ShoppingBag', 6),
('Inventory', NULL, 'Package', 7),
('Production', NULL, 'Factory', 8),
('Quality Check', '/quality', 'CheckCircle', 9),
('People', NULL, 'Users', 10),
('Masters', NULL, 'Package', 11),
('User & Roles', NULL, 'UserCog', 12),
('Configuration', '/configuration', 'Settings', 13)
ON CONFLICT DO NOTHING;

-- Insert CRM sub-items
INSERT INTO sidebar_items (title, url, icon, parent_id, sort_order)
SELECT 'Create/View Customers', '/crm/customers', 'Users', id, 1
FROM sidebar_items WHERE title = 'CRM'
ON CONFLICT DO NOTHING;

-- Insert Orders sub-items
INSERT INTO sidebar_items (title, url, icon, parent_id, sort_order)
SELECT 'Custom Orders', '/orders', 'ShoppingCart', id, 1
FROM sidebar_items WHERE title = 'Orders'
ON CONFLICT DO NOTHING;

-- Insert Accounts sub-items
INSERT INTO sidebar_items (title, url, icon, parent_id, sort_order)
SELECT sub_items.title, sub_items.url, sub_items.icon, sidebar_items.id, sub_items.sort_order
FROM (VALUES
    ('View Quotation', '/accounts/quotations', 'Calculator', 1),
    ('Create/View Invoices', '/accounts/invoices', 'Calculator', 2),
    ('Receipts', '/accounts/receipts', 'Calculator', 3),
    ('Payments', '/accounts/payments', 'Calculator', 4)
) AS sub_items(title, url, icon, sort_order)
CROSS JOIN sidebar_items WHERE sidebar_items.title = 'Accounts'
ON CONFLICT DO NOTHING;

-- Insert Procurement sub-items
INSERT INTO sidebar_items (title, url, icon, parent_id, sort_order)
SELECT sub_items.title, sub_items.url, sub_items.icon, sidebar_items.id, sub_items.sort_order
FROM (VALUES
    ('Bills of Materials', '/bom', 'ClipboardList', 1),
    ('Purchase Orders', '/procurement/po', 'ShoppingBag', 2),
    ('Goods Receipt Note', '/procurement/grn', 'ClipboardList', 3),
    ('Return to Vendor', '/procurement/returns', 'Truck', 4),
    ('Material Shortfall Alerts', '/procurement/alerts', 'AlertTriangle', 5)
) AS sub_items(title, url, icon, sort_order)
CROSS JOIN sidebar_items WHERE sidebar_items.title = 'Procurement'
ON CONFLICT DO NOTHING;

-- Insert Inventory sub-items
INSERT INTO sidebar_items (title, url, icon, parent_id, sort_order)
SELECT sub_items.title, sub_items.url, sub_items.icon, sidebar_items.id, sub_items.sort_order
FROM (VALUES
    ('Dashboard', '/warehouse/inventory', 'Building', 1),
    ('Fabric Master', '/warehouse/fabric-master', 'Package', 2),
    ('Item Master', '/warehouse/item-master', 'Package', 3),
    ('Warehouse Master', '/warehouse/warehouse-master', 'Building', 4)
) AS sub_items(title, url, icon, sort_order)
CROSS JOIN sidebar_items WHERE sidebar_items.title = 'Inventory'
ON CONFLICT DO NOTHING;

-- Insert Production sub-items
INSERT INTO sidebar_items (title, url, icon, parent_id, sort_order)
SELECT sub_items.title, sub_items.url, sub_items.icon, sidebar_items.id, sub_items.sort_order
FROM (VALUES
    ('Assign Orders', '/production/assign-orders', 'Factory', 1),
    ('Cutting Manager', '/production/cutting-manager', 'Scissors', 2),
    ('Stitching Manager', '/production/stitching-manager', 'Shirt', 3),
    ('Production Dashboard', '/production/dashboard', 'BarChart3', 4)
) AS sub_items(title, url, icon, sort_order)
CROSS JOIN sidebar_items WHERE sidebar_items.title = 'Production'
ON CONFLICT DO NOTHING;

-- Insert People sub-items
INSERT INTO sidebar_items (title, url, icon, parent_id, sort_order)
SELECT sub_items.title, sub_items.url, sub_items.icon, sidebar_items.id, sub_items.sort_order
FROM (VALUES
    ('Employee Management', '/people/employees', 'Users', 1),
    ('Employee Access Management', '/people/employee-access', 'UserCog', 2),
    ('Designations', '/people/designations', 'Award', 3)
) AS sub_items(title, url, icon, sort_order)
CROSS JOIN sidebar_items WHERE sidebar_items.title = 'People'
ON CONFLICT DO NOTHING;

-- Insert Masters sub-items
INSERT INTO sidebar_items (title, url, icon, parent_id, sort_order)
SELECT sub_items.title, sub_items.url, sub_items.icon, sidebar_items.id, sub_items.sort_order
FROM (VALUES
    ('Product Categories', '/masters/product-categories', 'Package', 1),
    ('Size Types', '/masters/size-types', 'Package', 2),
    ('Fabric Types', '/masters/fabric-types', 'Package', 3)
) AS sub_items(title, url, icon, sort_order)
CROSS JOIN sidebar_items WHERE sidebar_items.title = 'Masters'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 3: ENABLE RLS AND CREATE POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE sidebar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_sidebar_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sidebar_permissions ENABLE ROW LEVEL SECURITY;

-- Create policies for sidebar_items (drop if exists first)
DROP POLICY IF EXISTS "Authenticated users can view sidebar items" ON sidebar_items;
DROP POLICY IF EXISTS "Authenticated users can insert sidebar items" ON sidebar_items;
DROP POLICY IF EXISTS "Authenticated users can update sidebar items" ON sidebar_items;

-- Allow SELECT (view)
CREATE POLICY "Authenticated users can view sidebar items" ON sidebar_items
    FOR SELECT TO authenticated USING (true);

-- Allow INSERT (create)
CREATE POLICY "Authenticated users can insert sidebar items" ON sidebar_items
    FOR INSERT TO authenticated WITH CHECK (true);

-- Allow UPDATE (modify)
CREATE POLICY "Authenticated users can update sidebar items" ON sidebar_items
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Create policies for role_sidebar_permissions (drop if exists first)
DROP POLICY IF EXISTS "Authenticated users can view role sidebar permissions" ON role_sidebar_permissions;
DROP POLICY IF EXISTS "Authenticated users can manage role sidebar permissions" ON role_sidebar_permissions;
CREATE POLICY "Authenticated users can view role sidebar permissions" ON role_sidebar_permissions
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage role sidebar permissions" ON role_sidebar_permissions
    FOR ALL TO authenticated USING (true);

-- Create policies for user_sidebar_permissions (drop if exists first)
DROP POLICY IF EXISTS "Users can view own sidebar permissions" ON user_sidebar_permissions;
DROP POLICY IF EXISTS "Users can manage own sidebar permissions" ON user_sidebar_permissions;
CREATE POLICY "Users can view own sidebar permissions" ON user_sidebar_permissions
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own sidebar permissions" ON user_sidebar_permissions
    FOR ALL TO authenticated USING (auth.uid() = user_id);

-- ============================================================================
-- PART 4: SETUP DEFAULT ADMIN PERMISSIONS
-- ============================================================================

-- Get or create admin role
INSERT INTO roles (name, description) 
SELECT 'Admin', 'System Administrator with full access'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Admin');

-- Grant all sidebar permissions to admin role
INSERT INTO role_sidebar_permissions (role_id, sidebar_item_id, can_view, can_edit)
SELECT 
  r.id as role_id,
  si.id as sidebar_item_id,
  true as can_view,
  true as can_edit
FROM roles r
CROSS JOIN sidebar_items si
WHERE r.name = 'Admin'
AND NOT EXISTS (
  SELECT 1 FROM role_sidebar_permissions rsp 
  WHERE rsp.role_id = r.id AND rsp.sidebar_item_id = si.id
);

-- ============================================================================
-- PART 5: CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function to get user's effective sidebar permissions (drop if exists first)
DROP FUNCTION IF EXISTS get_user_sidebar_permissions(UUID);
CREATE OR REPLACE FUNCTION get_user_sidebar_permissions(p_user_id UUID)
RETURNS TABLE (
    sidebar_item_id UUID,
    title TEXT,
    url TEXT,
    icon TEXT,
    parent_id UUID,
    sort_order INTEGER,
    can_view BOOLEAN,
    can_edit BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    WITH user_permissions AS (
        -- Get user-specific permissions (overrides)
        SELECT 
            usp.sidebar_item_id,
            usp.can_view,
            usp.can_edit,
            1 as priority
        FROM user_sidebar_permissions usp
        WHERE usp.user_id = p_user_id
    ),
    role_permissions AS (
        -- Get role-based permissions
        SELECT 
            rsp.sidebar_item_id,
            rsp.can_view,
            rsp.can_edit,
            2 as priority
        FROM role_sidebar_permissions rsp
        JOIN user_roles ur ON ur.role_id = rsp.role_id
        WHERE ur.user_id = p_user_id
    ),
    effective_permissions AS (
        -- Combine permissions with user overrides taking precedence
        SELECT 
            sidebar_item_id,
            can_view,
            can_edit,
            MIN(priority) as min_priority
        FROM (
            SELECT * FROM user_permissions
            UNION ALL
            SELECT * FROM role_permissions
        ) combined
        GROUP BY sidebar_item_id, can_view, can_edit
        HAVING MIN(priority) = 1 OR (MIN(priority) = 2 AND sidebar_item_id NOT IN (
            SELECT sidebar_item_id FROM user_permissions
        ))
    )
    SELECT 
        si.id as sidebar_item_id,
        si.title,
        si.url,
        si.icon,
        si.parent_id,
        si.sort_order,
        COALESCE(ep.can_view, false) as can_view,
        COALESCE(ep.can_edit, false) as can_edit
    FROM sidebar_items si
    LEFT JOIN effective_permissions ep ON ep.sidebar_item_id = si.id
    WHERE si.is_active = true
    ORDER BY si.sort_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 6: VERIFICATION
-- ============================================================================

-- Verify the setup
SELECT 
    'Sidebar Items' as table_name,
    COUNT(*) as count
FROM sidebar_items
UNION ALL
SELECT 
    'Role Permissions' as table_name,
    COUNT(*) as count
FROM role_sidebar_permissions
UNION ALL
SELECT 
    'User Permissions' as table_name,
    COUNT(*) as count
FROM user_sidebar_permissions;

-- Show admin permissions
SELECT 
    r.name as role_name,
    si.title as sidebar_item,
    rsp.can_view,
    rsp.can_edit
FROM role_sidebar_permissions rsp
JOIN roles r ON r.id = rsp.role_id
JOIN sidebar_items si ON si.id = rsp.sidebar_item_id
WHERE r.name = 'Admin'
ORDER BY si.sort_order;

SELECT 'Sidebar permissions system setup complete!' as status;
-- Complete Inventory Adjustment System Setup
-- This migration combines all inventory adjustment tables and functions
-- Run this if the previous migrations haven't been applied

-- ============================================================================
-- PART 1: Base Tables
-- ============================================================================

-- 1. Create inventory_adjustment_reasons table
CREATE TABLE IF NOT EXISTS inventory_adjustment_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reason_name TEXT UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create inventory_adjustments table
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('ADD', 'REMOVE', 'REPLACE')),
  reason_id UUID REFERENCES inventory_adjustment_reasons(id),
  custom_reason TEXT,
  notes TEXT,
  adjusted_by UUID REFERENCES employees(id), -- Nullable to allow auth users without employee record
  adjusted_by_user_id UUID, -- Store auth user ID for reference
  adjustment_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Status tracking
  status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'COMPLETED', 'CANCELLED'))
);

-- 3. Create inventory_adjustment_items table
CREATE TABLE IF NOT EXISTS inventory_adjustment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID REFERENCES inventory_adjustments(id) ON DELETE CASCADE,
  product_id UUID NOT NULL, -- FK constraint added later if product_master exists
  sku TEXT NOT NULL,
  
  -- Product details snapshot (for historical tracking)
  product_name TEXT NOT NULL,
  product_class TEXT,
  product_color TEXT,
  product_size TEXT,
  product_category TEXT,
  product_brand TEXT,
  
  -- Quantity tracking
  quantity_before DECIMAL(10,2) NOT NULL,
  adjustment_quantity DECIMAL(10,2) NOT NULL,
  quantity_after DECIMAL(10,2) NOT NULL,
  
  -- Replace-specific
  replace_quantity DECIMAL(10,2), -- For REPLACE type
  
  unit TEXT DEFAULT 'pcs',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create inventory_adjustment_bins table (bin-level adjustments)
CREATE TABLE IF NOT EXISTS inventory_adjustment_bins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_item_id UUID REFERENCES inventory_adjustment_items(id) ON DELETE CASCADE NOT NULL,
  bin_id UUID REFERENCES bins(id) NOT NULL,
  quantity_before DECIMAL(10,2) NOT NULL,
  adjustment_quantity DECIMAL(10,2) NOT NULL,
  quantity_after DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create inventory_adjustment_logs table (Audit Trail)
CREATE TABLE IF NOT EXISTS inventory_adjustment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID REFERENCES inventory_adjustments(id) ON DELETE CASCADE,
  
  -- User information
  adjusted_by UUID REFERENCES employees(id), -- Nullable to allow auth users without employee record
  adjusted_by_user_id UUID, -- Store auth user ID for reference
  adjusted_by_name TEXT NOT NULL,
  
  -- Product information
  product_id UUID, -- FK constraint added later if product_master exists
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_details JSONB, -- Full product snapshot
  
  -- Adjustment details
  adjustment_type TEXT NOT NULL,
  reason_id UUID REFERENCES inventory_adjustment_reasons(id),
  reason_name TEXT,
  
  -- Quantity changes
  quantity_before DECIMAL(10,2) NOT NULL,
  adjustment_quantity DECIMAL(10,2) NOT NULL,
  quantity_after DECIMAL(10,2) NOT NULL,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 2: Indexes
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_adjustment_reasons' AND column_name = 'is_active') THEN
        CREATE INDEX IF NOT EXISTS idx_adjustment_reasons_active ON inventory_adjustment_reasons(is_active);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_adjustments' AND column_name = 'adjustment_date') THEN
        CREATE INDEX IF NOT EXISTS idx_adjustments_date ON inventory_adjustments(adjustment_date);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_adjustments' AND column_name = 'status') THEN
        CREATE INDEX IF NOT EXISTS idx_adjustments_status ON inventory_adjustments(status);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_adjustments' AND column_name = 'adjustment_type') THEN
        CREATE INDEX IF NOT EXISTS idx_adjustments_type ON inventory_adjustments(adjustment_type);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_adjustment_items' AND column_name = 'sku') THEN
        CREATE INDEX IF NOT EXISTS idx_adjustment_items_sku ON inventory_adjustment_items(sku);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_adjustment_items' AND column_name = 'product_id') THEN
        CREATE INDEX IF NOT EXISTS idx_adjustment_items_product ON inventory_adjustment_items(product_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_adjustment_items' AND column_name = 'adjustment_id') THEN
        CREATE INDEX IF NOT EXISTS idx_adjustment_items_adjustment ON inventory_adjustment_items(adjustment_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_adjustment_bins' AND column_name = 'adjustment_item_id') THEN
        CREATE INDEX IF NOT EXISTS idx_adjustment_bins_item ON inventory_adjustment_bins(adjustment_item_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_adjustment_bins' AND column_name = 'bin_id') THEN
        CREATE INDEX IF NOT EXISTS idx_adjustment_bins_bin ON inventory_adjustment_bins(bin_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_adjustment_logs' AND column_name = 'created_at') THEN
        CREATE INDEX IF NOT EXISTS idx_adjustment_logs_date ON inventory_adjustment_logs(created_at);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_adjustment_logs' AND column_name = 'sku') THEN
        CREATE INDEX IF NOT EXISTS idx_adjustment_logs_sku ON inventory_adjustment_logs(sku);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_adjustment_logs' AND column_name = 'adjustment_id') THEN
        CREATE INDEX IF NOT EXISTS idx_adjustment_logs_adjustment ON inventory_adjustment_logs(adjustment_id);
    END IF;
END $$;

-- ============================================================================
-- PART 3: Row Level Security (RLS)
-- ============================================================================

ALTER TABLE inventory_adjustment_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustment_bins ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustment_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Authenticated users can manage adjustment reasons" ON inventory_adjustment_reasons;
DROP POLICY IF EXISTS "Authenticated users can manage adjustments" ON inventory_adjustments;
DROP POLICY IF EXISTS "Authenticated users can manage adjustment items" ON inventory_adjustment_items;
DROP POLICY IF EXISTS "Authenticated users can manage adjustment bins" ON inventory_adjustment_bins;
DROP POLICY IF EXISTS "Authenticated users can view adjustment logs" ON inventory_adjustment_logs;

-- Create RLS Policies
CREATE POLICY "Authenticated users can manage adjustment reasons"
  ON inventory_adjustment_reasons FOR ALL
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage adjustments"
  ON inventory_adjustments FOR ALL
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage adjustment items"
  ON inventory_adjustment_items FOR ALL
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage adjustment bins"
  ON inventory_adjustment_bins FOR ALL
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can view adjustment logs"
  ON inventory_adjustment_logs FOR SELECT
  TO authenticated USING (true);

-- ============================================================================
-- PART 4: Triggers
-- ============================================================================

-- Create updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_adjustment_reasons_updated_at ON inventory_adjustment_reasons;
CREATE TRIGGER update_adjustment_reasons_updated_at 
    BEFORE UPDATE ON inventory_adjustment_reasons 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 5: Default Data
-- ============================================================================

-- Insert default adjustment reasons
INSERT INTO inventory_adjustment_reasons (reason_name, description, is_active)
VALUES 
  ('Sold on Amazon', 'Products sold through Amazon marketplace', true),
  ('Internally Used', 'Products used for internal purposes', true),
  ('Rejected', 'Products rejected due to quality issues', true),
  ('Damaged', 'Products damaged and removed from inventory', true),
  ('Returned', 'Products returned by customers', true),
  ('Stock Count Correction', 'Correction after physical stock count', true),
  ('Theft/Loss', 'Products lost or stolen', true),
  ('Expired', 'Products expired and removed', true)
ON CONFLICT (reason_name) DO NOTHING;

-- ============================================================================
-- PART 6: Execute Inventory Adjustment Function
-- ============================================================================

CREATE OR REPLACE FUNCTION execute_inventory_adjustment(
  p_adjustment_id UUID,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_adjustment RECORD;
  v_item RECORD;
  v_bin_adjustment RECORD;
  v_inventory_record RECORD;
  v_current_stock DECIMAL(10,2);
  v_new_stock DECIMAL(10,2);
  v_bin_current_qty DECIMAL(10,2);
  v_bin_new_qty DECIMAL(10,2);
  v_user_name TEXT;
  v_product_details JSONB;
  v_result JSONB := '{"success": false, "errors": []}'::JSONB;
  v_total_bin_adjustment DECIMAL(10,2) := 0;
  v_record_found BOOLEAN := false;
BEGIN
  -- Get adjustment details
  SELECT * INTO v_adjustment
  FROM inventory_adjustments
  WHERE id = p_adjustment_id AND status = 'DRAFT';
  
  IF NOT FOUND THEN
    v_result := jsonb_set(v_result, '{errors}', '["Adjustment not found or already processed"]'::JSONB);
    RETURN v_result;
  END IF;
  
  -- Get user name - try from employees first, then from profiles
  -- Try to get name from employees table if adjusted_by exists
  IF v_adjustment.adjusted_by IS NOT NULL THEN
    SELECT full_name INTO v_user_name
    FROM employees
    WHERE id = v_adjustment.adjusted_by;
  END IF;
  
  -- If not found in employees, try to get from profiles via adjusted_by_user_id
  IF v_user_name IS NULL AND v_adjustment.adjusted_by_user_id IS NOT NULL THEN
    SELECT full_name INTO v_user_name
    FROM profiles
    WHERE user_id = v_adjustment.adjusted_by_user_id
    LIMIT 1;
  END IF;
  
  -- If still not found, try to get from auth.users metadata
  IF v_user_name IS NULL AND v_adjustment.adjusted_by_user_id IS NOT NULL THEN
    -- Use the user_id from adjustment record as fallback
    SELECT COALESCE(
      (SELECT raw_user_meta_data->>'name' FROM auth.users WHERE id = v_adjustment.adjusted_by_user_id),
      (SELECT email FROM auth.users WHERE id = v_adjustment.adjusted_by_user_id),
      'Unknown User'
    ) INTO v_user_name;
  END IF;
  
  IF v_user_name IS NULL THEN
    v_user_name := 'Unknown User';
  END IF;
  
  -- Process each item
  FOR v_item IN 
    SELECT * FROM inventory_adjustment_items 
    WHERE adjustment_id = p_adjustment_id
  LOOP
    -- Check if this item has bin-level adjustments
    SELECT COUNT(*) INTO v_total_bin_adjustment
    FROM inventory_adjustment_bins
    WHERE adjustment_item_id = v_item.id;
    
    IF v_total_bin_adjustment > 0 THEN
      -- Process bin-level adjustments
      v_total_bin_adjustment := 0;
      
      FOR v_bin_adjustment IN
        SELECT * FROM inventory_adjustment_bins
        WHERE adjustment_item_id = v_item.id
      LOOP
        -- Get current bin quantity - sum all quantities for this product in this bin
        SELECT COALESCE(SUM(quantity), 0) INTO v_bin_current_qty
        FROM warehouse_inventory
        WHERE bin_id = v_bin_adjustment.bin_id
          AND item_id = v_item.product_id
          AND item_type = 'PRODUCT';
        
        -- Validate bin quantity matches
        IF v_bin_current_qty != v_bin_adjustment.quantity_before THEN
          v_result := jsonb_set(
            v_result, 
            '{errors}', 
            jsonb_insert(
              COALESCE(v_result->'errors', '[]'::JSONB), 
              '-1', 
              to_jsonb(format('Bin quantity mismatch for SKU %s: expected %s, found %s', 
                v_item.sku, v_bin_adjustment.quantity_before, v_bin_current_qty))
            )
          );
          CONTINUE;
        END IF;
        
        -- Calculate new bin quantity
        IF v_adjustment.adjustment_type = 'ADD' THEN
          v_bin_new_qty := v_bin_current_qty + v_bin_adjustment.adjustment_quantity;
        ELSIF v_adjustment.adjustment_type = 'REMOVE' THEN
          IF v_bin_current_qty < v_bin_adjustment.adjustment_quantity THEN
            v_result := jsonb_set(
              v_result, 
              '{errors}', 
              jsonb_insert(
                COALESCE(v_result->'errors', '[]'::JSONB), 
                '-1', 
                to_jsonb(format('Insufficient bin quantity for SKU %s: have %s, need %s', 
                  v_item.sku, v_bin_current_qty, v_bin_adjustment.adjustment_quantity))
              )
            );
            CONTINUE;
          END IF;
          v_bin_new_qty := v_bin_current_qty - v_bin_adjustment.adjustment_quantity;
        ELSIF v_adjustment.adjustment_type = 'REPLACE' THEN
          v_bin_new_qty := v_bin_adjustment.quantity_after;
        END IF;
        
        -- Update warehouse_inventory for this bin
        -- Find the most recent warehouse_inventory record for this bin and product
        SELECT * INTO v_inventory_record
        FROM warehouse_inventory
        WHERE bin_id = v_bin_adjustment.bin_id
          AND item_id = v_item.product_id
          AND item_type = 'PRODUCT'
        ORDER BY created_at DESC
        LIMIT 1;
        
        v_record_found := FOUND;
        
        IF v_record_found THEN
          -- Update existing record
          UPDATE warehouse_inventory
          SET quantity = v_bin_new_qty,
              updated_at = NOW()
          WHERE id = v_inventory_record.id;
        ELSE
          -- If no record exists and it's an ADD operation, create new record
          IF v_adjustment.adjustment_type = 'ADD' THEN
            INSERT INTO warehouse_inventory (
              item_type,
              item_id,
              item_name,
              item_code,
              bin_id,
              quantity,
              unit,
              status
            ) VALUES (
              'PRODUCT',
              v_item.product_id,
              v_item.product_name,
              v_item.sku,
              v_bin_adjustment.bin_id,
              v_bin_adjustment.adjustment_quantity,
              COALESCE(v_item.unit, 'pcs'),
              'IN_STORAGE'
            );
          END IF;
        END IF;
        
        -- Update bin adjustment record with actual quantities
        UPDATE inventory_adjustment_bins
        SET quantity_after = v_bin_new_qty
        WHERE id = v_bin_adjustment.id;
        
        -- Track total bin adjustment for product_master update
        IF v_adjustment.adjustment_type = 'ADD' THEN
          v_total_bin_adjustment := v_total_bin_adjustment + v_bin_adjustment.adjustment_quantity;
        ELSIF v_adjustment.adjustment_type = 'REMOVE' THEN
          v_total_bin_adjustment := v_total_bin_adjustment - v_bin_adjustment.adjustment_quantity;
        ELSIF v_adjustment.adjustment_type = 'REPLACE' THEN
          v_total_bin_adjustment := v_total_bin_adjustment + (v_bin_adjustment.quantity_after - v_bin_adjustment.quantity_before);
        END IF;
      END LOOP;
      
      -- Update product_master based on bin adjustments
      IF v_total_bin_adjustment != 0 THEN
        SELECT COALESCE(current_stock, 0) INTO v_current_stock
        FROM product_master
        WHERE id = v_item.product_id;
        
        v_new_stock := v_current_stock + v_total_bin_adjustment;
        
        UPDATE product_master
        SET current_stock = v_new_stock,
            updated_at = NOW()
        WHERE id = v_item.product_id;
        
        -- Update adjustment item with actual quantities
        UPDATE inventory_adjustment_items
        SET quantity_before = v_current_stock,
            adjustment_quantity = ABS(v_total_bin_adjustment),
            quantity_after = v_new_stock
        WHERE id = v_item.id;
      END IF;
    ELSE
      -- No bin adjustments - use product-level adjustment (original logic)
      -- Get current stock
      SELECT COALESCE(current_stock, 0) INTO v_current_stock
      FROM product_master
      WHERE id = v_item.product_id;
      
      -- Validate current stock matches
      IF v_current_stock != v_item.quantity_before THEN
        v_result := jsonb_set(
          v_result, 
          '{errors}', 
          jsonb_insert(
            COALESCE(v_result->'errors', '[]'::JSONB), 
            '-1', 
            to_jsonb(format('Stock mismatch for SKU %s: expected %s, found %s', 
              v_item.sku, v_item.quantity_before, v_current_stock))
          )
        );
        CONTINUE;
      END IF;
      
      -- Calculate new stock based on adjustment type
      IF v_adjustment.adjustment_type = 'ADD' THEN
        v_new_stock := v_current_stock + v_item.adjustment_quantity;
      ELSIF v_adjustment.adjustment_type = 'REMOVE' THEN
        IF v_current_stock < v_item.adjustment_quantity THEN
          v_result := jsonb_set(
            v_result, 
            '{errors}', 
            jsonb_insert(
              COALESCE(v_result->'errors', '[]'::JSONB), 
              '-1', 
              to_jsonb(format('Insufficient stock for SKU %s: have %s, need %s', 
                v_item.sku, v_current_stock, v_item.adjustment_quantity))
            )
          );
          CONTINUE;
        END IF;
        v_new_stock := v_current_stock - v_item.adjustment_quantity;
      ELSIF v_adjustment.adjustment_type = 'REPLACE' THEN
        -- For REPLACE, use replace_quantity if available, otherwise use quantity_after
        v_new_stock := COALESCE(v_item.replace_quantity, v_item.quantity_after);
      END IF;
      
      -- Update product stock
      UPDATE product_master
      SET current_stock = v_new_stock,
          updated_at = NOW()
      WHERE id = v_item.product_id;
      
      -- Update adjustment item with actual quantities
      UPDATE inventory_adjustment_items
      SET quantity_after = v_new_stock
      WHERE id = v_item.id;
    END IF;
    
    -- Get product details for logging
    SELECT to_jsonb(pm.*) INTO v_product_details
    FROM product_master pm
    WHERE pm.id = v_item.product_id;
    
    -- Create log entry
    -- Use adjusted_by from adjustment record (may be null), and adjusted_by_user_id
    INSERT INTO inventory_adjustment_logs (
      adjustment_id,
      adjusted_by,
      adjusted_by_user_id,
      adjusted_by_name,
      product_id,
      sku,
      product_name,
      product_details,
      adjustment_type,
      reason_id,
      reason_name,
      quantity_before,
      adjustment_quantity,
      quantity_after,
      notes
    ) VALUES (
      p_adjustment_id,
      v_adjustment.adjusted_by, -- Employee ID (may be null)
      v_adjustment.adjusted_by_user_id, -- Auth user ID (always present)
      v_user_name,
      v_item.product_id,
      v_item.sku,
      v_item.product_name,
      v_product_details,
      v_adjustment.adjustment_type,
      v_adjustment.reason_id,
      (SELECT reason_name FROM inventory_adjustment_reasons WHERE id = v_adjustment.reason_id),
      v_item.quantity_before,
      v_item.adjustment_quantity,
      COALESCE(v_new_stock, v_item.quantity_after),
      v_adjustment.notes
    );
  END LOOP;
  
  -- If no errors, mark adjustment as completed
  IF jsonb_array_length(COALESCE(v_result->'errors', '[]'::JSONB)) = 0 THEN
    UPDATE inventory_adjustments
    SET status = 'COMPLETED'
    WHERE id = p_adjustment_id;
    
    v_result := jsonb_set(v_result, '{success}', 'true'::JSONB);
  END IF;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 7: Comments
-- ============================================================================

COMMENT ON TABLE inventory_adjustment_reasons IS 'Predefined reasons for inventory adjustments';
COMMENT ON TABLE inventory_adjustments IS 'Main inventory adjustment records';
COMMENT ON TABLE inventory_adjustment_items IS 'Individual items within an adjustment';
COMMENT ON TABLE inventory_adjustment_bins IS 'Bin-level inventory adjustments linked to adjustment items';
COMMENT ON TABLE inventory_adjustment_logs IS 'Complete audit trail of all inventory adjustments';
COMMENT ON FUNCTION execute_inventory_adjustment IS 'Executes an inventory adjustment and updates product stock and warehouse inventory';

-- Inventory allocations for BOM items

CREATE TABLE IF NOT EXISTS public.inventory_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_inventory_id UUID NOT NULL REFERENCES public.warehouse_inventory(id) ON DELETE CASCADE,
  bom_id UUID REFERENCES public.bom_records(id) ON DELETE SET NULL,
  bom_item_id UUID REFERENCES public.bom_record_items(id) ON DELETE SET NULL,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity >= 0),
  unit TEXT DEFAULT 'pcs',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_inventory_allocations_warehouse_inventory_id
  ON public.inventory_allocations(warehouse_inventory_id);

CREATE INDEX IF NOT EXISTS idx_inventory_allocations_bom_item_id
  ON public.inventory_allocations(bom_item_id);

ALTER TABLE public.inventory_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_allocations_select" ON public.inventory_allocations;
DROP POLICY IF EXISTS "inventory_allocations_modify" ON public.inventory_allocations;

CREATE POLICY "inventory_allocations_select" ON public.inventory_allocations
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "inventory_allocations_modify" ON public.inventory_allocations
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

GRANT ALL ON public.inventory_allocations TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_allocations TO authenticated;

CREATE OR REPLACE VIEW public.warehouse_inventory_allocation_summary AS
SELECT
  wi.id AS warehouse_inventory_id,
  COALESCE(SUM(ia.quantity), 0) AS allocated_quantity
FROM public.warehouse_inventory wi
LEFT JOIN public.inventory_allocations ia ON ia.warehouse_inventory_id = wi.id
GROUP BY wi.id;

GRANT SELECT ON public.warehouse_inventory_allocation_summary TO anon, authenticated, service_role;

-- Create inventory_logs table to track all inventory changes
-- This maintains a complete history of item additions, removals, adjustments, transfers, etc.

CREATE TABLE IF NOT EXISTS inventory_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_inventory_id UUID REFERENCES warehouse_inventory(id) ON DELETE CASCADE,
  grn_id UUID,
  grn_item_id UUID,
  item_type TEXT NOT NULL,
  item_id UUID,
  item_name TEXT NOT NULL,
  item_code TEXT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL, -- Quantity changed (positive for additions, negative for removals)
  old_quantity DECIMAL(10,3), -- Previous quantity before change
  new_quantity DECIMAL(10,3), -- New quantity after change
  unit TEXT NOT NULL,
  bin_id UUID REFERENCES bins(id),
  from_bin_id UUID REFERENCES bins(id), -- For transfers
  to_bin_id UUID REFERENCES bins(id), -- For transfers
  status TEXT NOT NULL DEFAULT 'RECEIVED',
  old_status TEXT, -- Previous status (for status changes)
  new_status TEXT, -- New status (for status changes)
  color TEXT, -- item_color or fabric_color
  action TEXT NOT NULL DEFAULT 'ADDED', -- 'ADDED', 'CONSOLIDATED', 'REMOVED', 'ADJUSTED', 'TRANSFERRED', 'STATUS_CHANGED'
  reference_type TEXT, -- 'GRN', 'PRODUCTION', 'TRANSFER', 'ADJUSTMENT', 'DISPATCH', etc.
  reference_id UUID, -- ID of the related record (e.g., order_id, cutting_job_id, etc.)
  reference_number TEXT, -- Human-readable reference (e.g., order number, job number)
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create indexes for better performance (with column checks)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'warehouse_inventory_id') THEN
        CREATE INDEX IF NOT EXISTS idx_inventory_logs_warehouse_inventory_id ON inventory_logs(warehouse_inventory_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'item_id') THEN
        CREATE INDEX IF NOT EXISTS idx_inventory_logs_item_id ON inventory_logs(item_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'item_code') THEN
        CREATE INDEX IF NOT EXISTS idx_inventory_logs_item_code ON inventory_logs(item_code);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'grn_id') THEN
        CREATE INDEX IF NOT EXISTS idx_inventory_logs_grn_id ON inventory_logs(grn_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'created_at') THEN
        CREATE INDEX IF NOT EXISTS idx_inventory_logs_created_at ON inventory_logs(created_at);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'action') THEN
        CREATE INDEX IF NOT EXISTS idx_inventory_logs_action ON inventory_logs(action);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'reference_type') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'reference_id') THEN
        CREATE INDEX IF NOT EXISTS idx_inventory_logs_reference ON inventory_logs(reference_type, reference_id);
    END IF;
END $$;

-- Enable RLS
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Authenticated users can view inventory logs" ON inventory_logs;
DROP POLICY IF EXISTS "Authenticated users can insert inventory logs" ON inventory_logs;
DROP POLICY IF EXISTS "Authenticated users can manage inventory logs" ON inventory_logs;

-- Create RLS policies
CREATE POLICY "Authenticated users can view inventory logs"
  ON inventory_logs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert inventory logs"
  ON inventory_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage inventory logs"
  ON inventory_logs
  FOR ALL
  TO authenticated
  USING (true);

-- Create BOM (Bill of Materials) tables for procurement management
-- This migration creates the missing bom_records and bom_record_items tables

-- Create BOM record tables to store generated BOMs per order/product
create table if not exists public.bom_records (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  product_name text,
  product_image_url text,
  total_order_qty numeric,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);

create table if not exists public.bom_record_items (
  id uuid primary key default gen_random_uuid(),
  bom_id uuid not null references public.bom_records(id) on delete cascade,
  item_id uuid references public.item_master(id) on delete set null,
  item_code text,
  item_name text,
  category text,
  unit_of_measure text,
  qty_per_product numeric,
  qty_total numeric,
  stock numeric default 0,
  to_order numeric default 0,
  created_at timestamptz default now()
);

-- Enable Row Level Security (RLS) on the new tables
alter table public.bom_records enable row level security;
alter table public.bom_record_items enable row level security;

-- Create RLS policies for authenticated users
create policy "auth manage bom_records" on public.bom_records 
  for all to authenticated using (true) with check (true);

create policy "auth manage bom_record_items" on public.bom_record_items 
  for all to authenticated using (true) with check (true);

-- Create indexes for better performance
create index if not exists idx_bom_records_order_id on public.bom_records(order_id);
create index if not exists idx_bom_records_created_by on public.bom_records(created_by);
create index if not exists idx_bom_record_items_bom_id on public.bom_record_items(bom_id);
create index if not exists idx_bom_record_items_item_id on public.bom_record_items(item_id);

-- Add comments for documentation
comment on table public.bom_records is 'Stores Bill of Materials records for orders and products';
comment on table public.bom_record_items is 'Stores individual items/components that make up each BOM';
comment on column public.bom_records.order_id is 'Reference to the order this BOM belongs to';
comment on column public.bom_records.order_item_id is 'Reference to specific order item if applicable';
comment on column public.bom_records.total_order_qty is 'Total quantity ordered for this product';
comment on column public.bom_record_items.bom_id is 'Reference to the parent BOM record';
comment on column public.bom_record_items.item_id is 'Reference to the item master record';
comment on column public.bom_record_items.qty_per_product is 'Quantity of this item needed per product unit';
comment on column public.bom_record_items.qty_total is 'Total quantity needed for the entire order';
comment on column public.bom_record_items.stock is 'Current available stock of this item';
comment on column public.bom_record_items.to_order is 'Quantity that needs to be ordered';
-- Create BOM-PO tracking table
CREATE TABLE IF NOT EXISTS bom_po_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bom_id UUID REFERENCES bom_records(id) ON DELETE CASCADE,
  bom_item_id UUID REFERENCES bom_record_items(id) ON DELETE CASCADE,
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  po_item_id UUID REFERENCES purchase_order_items(id) ON DELETE CASCADE,
  ordered_quantity DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bom_po_items_bom_id ON bom_po_items(bom_id);
CREATE INDEX IF NOT EXISTS idx_bom_po_items_bom_item_id ON bom_po_items(bom_item_id);
CREATE INDEX IF NOT EXISTS idx_bom_po_items_po_id ON bom_po_items(po_id);

-- Create view to easily check remaining quantities
CREATE OR REPLACE VIEW bom_item_order_status AS
SELECT 
  br.id as bom_id,
  br.bom_number,
  bri.id as bom_item_id,
  bri.item_name,
  bri.qty_total as total_required,
  COALESCE(SUM(bpi.ordered_quantity), 0) as total_ordered,
  bri.qty_total - COALESCE(SUM(bpi.ordered_quantity), 0) as remaining_quantity
FROM bom_records br
JOIN bom_record_items bri ON br.id = bri.bom_id
LEFT JOIN bom_po_items bpi ON bri.id = bpi.bom_item_id
GROUP BY br.id, br.bom_number, bri.id, bri.item_name, bri.qty_total;

-- Enable RLS on the new table
ALTER TABLE bom_po_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for bom_po_items
CREATE POLICY "Enable read access for all users" ON bom_po_items
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON bom_po_items
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON bom_po_items
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users only" ON bom_po_items
    FOR DELETE USING (auth.role() = 'authenticated');

-- Grant necessary permissions
GRANT ALL ON bom_po_items TO postgres, anon, authenticated, service_role;
GRANT SELECT ON bom_item_order_status TO postgres, anon, authenticated, service_role;
-- Ensure fabric_picking_records table exists with correct schema
-- This migration fixes the "Could not find the 'picked_by' column" error

-- Drop table if it exists (to ensure clean recreation)
DROP TABLE IF EXISTS fabric_picking_records CASCADE;

-- Create fabric_picking_records table with correct schema
CREATE TABLE IF NOT EXISTS fabric_picking_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    fabric_id UUID REFERENCES fabrics(id) ON DELETE CASCADE,
    storage_zone_id UUID REFERENCES fabric_storage_zones(id) ON DELETE SET NULL,
    picked_quantity DECIMAL(10,2) NOT NULL,
    unit TEXT DEFAULT 'meters',
    picked_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    picked_by_name TEXT,
    picked_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_fabric_picking_records_order_id ON fabric_picking_records(order_id);
CREATE INDEX IF NOT EXISTS idx_fabric_picking_records_fabric_id ON fabric_picking_records(fabric_id);
CREATE INDEX IF NOT EXISTS idx_fabric_picking_records_picked_by_id ON fabric_picking_records(picked_by_id);
CREATE INDEX IF NOT EXISTS idx_fabric_picking_records_picked_at ON fabric_picking_records(picked_at);

-- Enable RLS (Row Level Security)
ALTER TABLE fabric_picking_records ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view fabric picking records" ON fabric_picking_records
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert fabric picking records" ON fabric_picking_records
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update fabric picking records" ON fabric_picking_records
    FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete fabric picking records" ON fabric_picking_records
    FOR DELETE USING (auth.uid() IS NOT NULL);

-- Grant permissions
GRANT ALL ON fabric_picking_records TO authenticated;
GRANT ALL ON fabric_picking_records TO service_role;
-- Ensure all fabric-related tables exist with correct schema
-- This migration fixes fabric picking functionality

-- 1. Create fabric_storage_zones table if it doesn't exist
CREATE TABLE IF NOT EXISTS fabric_storage_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_name TEXT NOT NULL,
    zone_code TEXT UNIQUE NOT NULL,
    warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
    capacity DECIMAL(10,2),
    current_usage DECIMAL(10,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create fabric_inventory table if it doesn't exist
CREATE TABLE IF NOT EXISTS fabric_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fabric_id UUID REFERENCES fabrics(id) ON DELETE CASCADE,
    storage_zone_id UUID REFERENCES fabric_storage_zones(id) ON DELETE CASCADE,
    available_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
    reserved_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
    unit TEXT DEFAULT 'meters',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(fabric_id, storage_zone_id)
);

-- 3. Ensure fabric_picking_records table exists (recreate if needed)
-- DROP TABLE IF EXISTS fabric_picking_records CASCADE;
CREATE TABLE IF NOT EXISTS fabric_picking_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    fabric_id UUID REFERENCES fabrics(id) ON DELETE CASCADE,
    storage_zone_id UUID REFERENCES fabric_storage_zones(id) ON DELETE SET NULL,
    picked_quantity DECIMAL(10,2) NOT NULL,
    unit TEXT DEFAULT 'meters',
    picked_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    picked_by_name TEXT,
    picked_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create fabric_usage_records table if it doesn't exist
CREATE TABLE IF NOT EXISTS fabric_usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    fabric_id UUID REFERENCES fabrics(id) ON DELETE CASCADE,
    planned_quantity DECIMAL(10,2),
    actual_quantity DECIMAL(10,2),
    wastage_quantity DECIMAL(10,2),
    unit TEXT DEFAULT 'meters',
    used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_fabric_storage_zones_code ON fabric_storage_zones(zone_code);
CREATE INDEX IF NOT EXISTS idx_fabric_inventory_fabric ON fabric_inventory(fabric_id);
CREATE INDEX IF NOT EXISTS idx_fabric_inventory_zone ON fabric_inventory(storage_zone_id);
CREATE INDEX IF NOT EXISTS idx_fabric_picking_records_order_id ON fabric_picking_records(order_id);
CREATE INDEX IF NOT EXISTS idx_fabric_picking_records_fabric_id ON fabric_picking_records(fabric_id);
CREATE INDEX IF NOT EXISTS idx_fabric_picking_records_picked_by_id ON fabric_picking_records(picked_by_id);
CREATE INDEX IF NOT EXISTS idx_fabric_picking_records_picked_at ON fabric_picking_records(picked_at);
CREATE INDEX IF NOT EXISTS idx_fabric_usage_records_order_id ON fabric_usage_records(order_id);
CREATE INDEX IF NOT EXISTS idx_fabric_usage_records_fabric_id ON fabric_usage_records(fabric_id);

-- Enable RLS (Row Level Security) for all tables
ALTER TABLE fabric_storage_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_picking_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_usage_records ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for fabric_storage_zones
CREATE POLICY "Users can view fabric storage zones" ON fabric_storage_zones
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert fabric storage zones" ON fabric_storage_zones
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update fabric storage zones" ON fabric_storage_zones
    FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Create RLS policies for fabric_inventory
CREATE POLICY "Users can view fabric inventory" ON fabric_inventory
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert fabric inventory" ON fabric_inventory
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update fabric inventory" ON fabric_inventory
    FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Create RLS policies for fabric_picking_records
CREATE POLICY "Users can view fabric picking records" ON fabric_picking_records
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert fabric picking records" ON fabric_picking_records
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update fabric picking records" ON fabric_picking_records
    FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete fabric picking records" ON fabric_picking_records
    FOR DELETE USING (auth.uid() IS NOT NULL);

-- Create RLS policies for fabric_usage_records
CREATE POLICY "Users can view fabric usage records" ON fabric_usage_records
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert fabric usage records" ON fabric_usage_records
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update fabric usage records" ON fabric_usage_records
    FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Grant permissions
GRANT ALL ON fabric_storage_zones TO authenticated;
GRANT ALL ON fabric_storage_zones TO service_role;
GRANT ALL ON fabric_inventory TO authenticated;
GRANT ALL ON fabric_inventory TO service_role;
GRANT ALL ON fabric_picking_records TO authenticated;
GRANT ALL ON fabric_picking_records TO service_role;
GRANT ALL ON fabric_usage_records TO authenticated;
GRANT ALL ON fabric_usage_records TO service_role;
-- Create designations table
CREATE TABLE IF NOT EXISTS designations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_designations_name ON designations(name);
CREATE INDEX IF NOT EXISTS idx_designations_department_id ON designations(department_id);
CREATE INDEX IF NOT EXISTS idx_designations_is_active ON designations(is_active);

-- Enable RLS
ALTER TABLE designations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (drop if exists first)
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON designations;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON designations;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON designations;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON designations;

CREATE POLICY "Enable read access for authenticated users" ON designations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON designations
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users" ON designations
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable delete access for authenticated users" ON designations
  FOR DELETE TO authenticated USING (true);

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_designations_updated_at ON designations;
CREATE TRIGGER update_designations_updated_at
  BEFORE UPDATE ON designations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert some default designations
INSERT INTO designations (name, description) VALUES
  ('Manager', 'Department or team manager'),
  ('Senior Executive', 'Senior level executive'),
  ('Executive', 'Mid-level executive'),
  ('Associate', 'Entry to mid-level associate'),
  ('Trainee', 'Entry level trainee position'),
  ('Director', 'Senior management position'),
  ('CEO', 'Chief Executive Officer'),
  ('CTO', 'Chief Technology Officer'),
  ('CFO', 'Chief Financial Officer'),
  ('HR Manager', 'Human Resources Manager'),
  ('Sales Manager', 'Sales Department Manager'),
  ('Production Manager', 'Production Department Manager'),
  ('Quality Manager', 'Quality Control Manager'),
  ('Cutting Manager', 'Cutting Department Manager'),
  ('Stitching Manager', 'Stitching Department Manager'),
  ('Dispatch Manager', 'Dispatch and Logistics Manager')
ON CONFLICT (name) DO NOTHING;
-- Create designations table
CREATE TABLE IF NOT EXISTS designations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  level INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_designations_name ON designations(name);
CREATE INDEX IF NOT EXISTS idx_designations_is_active ON designations(is_active);

-- Enable RLS
ALTER TABLE designations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Enable read access for authenticated users" ON designations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON designations
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users" ON designations
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable delete access for authenticated users" ON designations
  FOR DELETE TO authenticated USING (true);

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_designations_updated_at ON designations;
CREATE TRIGGER update_designations_updated_at
  BEFORE UPDATE ON designations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert some default designations
INSERT INTO designations (name, description, level) VALUES
  ('Manager', 'Department or team manager', 5),
  ('Senior Executive', 'Senior level executive', 4),
  ('Executive', 'Mid-level executive', 3),
  ('Associate', 'Entry to mid-level associate', 2),
  ('Trainee', 'Entry level trainee position', 1),
  ('Director', 'Senior management position', 6),
  ('CEO', 'Chief Executive Officer', 7),
  ('CTO', 'Chief Technology Officer', 7),
  ('CFO', 'Chief Financial Officer', 7),
  ('HR Manager', 'Human Resources Manager', 5),
  ('Sales Manager', 'Sales Department Manager', 5),
  ('Production Manager', 'Production Department Manager', 5),
  ('Quality Manager', 'Quality Control Manager', 5),
  ('Cutting Manager', 'Cutting Department Manager', 5),
  ('Stitching Manager', 'Stitching Department Manager', 5),
  ('Dispatch Manager', 'Dispatch and Logistics Manager', 5)
ON CONFLICT (name) DO NOTHING;
-- Add items table for per-size partial dispatch tracking

create table if not exists public.dispatch_order_items (
  id uuid primary key default gen_random_uuid(),
  dispatch_order_id uuid not null references public.dispatch_orders(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_batch_assignment_id uuid references public.order_batch_assignments(id) on delete set null,
  size_name text,
  quantity integer not null check (quantity >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_dispatch_order_items_dispatch on public.dispatch_order_items(dispatch_order_id);
create index if not exists idx_dispatch_order_items_order on public.dispatch_order_items(order_id);

comment on table public.dispatch_order_items is 'Per-line dispatch quantities to support partial dispatch by size/assignment';


-- Create order_assignments table to persist production assignments
create table if not exists public.order_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  cutting_master_id uuid null references public.employees(id) on delete set null,
  cutting_master_name text null,
  cutting_work_date date null,
  pattern_master_id uuid null references public.employees(id) on delete set null,
  pattern_master_name text null,
  pattern_work_date date null,
  cut_quantity numeric null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_order_assignments_order unique(order_id)
);

-- Trigger to update updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_order_assignments_updated_at on public.order_assignments;
create trigger trg_order_assignments_updated_at
before update on public.order_assignments
for each row execute function public.set_updated_at();

-- Indexes
create index if not exists idx_order_assignments_order_id on public.order_assignments(order_id);
create index if not exists idx_order_assignments_cutting_master_id on public.order_assignments(cutting_master_id);
create index if not exists idx_order_assignments_pattern_master_id on public.order_assignments(pattern_master_id);

-- Enable RLS and allow authenticated users to manage
alter table public.order_assignments enable row level security;

drop policy if exists "auth select order_assignments" on public.order_assignments;
drop policy if exists "auth manage order_assignments" on public.order_assignments;

create policy "auth select order_assignments" on public.order_assignments
  for select to authenticated using (true);

create policy "auth manage order_assignments" on public.order_assignments
  for all to authenticated using (true) with check (true);

-- QC reviews to approve/reject picked quantities per batch assignment and size

create table if not exists public.qc_reviews (
  id uuid primary key default gen_random_uuid(),
  order_batch_assignment_id uuid not null references public.order_batch_assignments(id) on delete cascade,
  size_name text not null,
  picked_quantity integer not null default 0,
  approved_quantity integer not null default 0,
  rejected_quantity integer not null default 0,
  remarks text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique(order_batch_assignment_id, size_name)
);

alter table public.qc_reviews enable row level security;

drop policy if exists "qc reviews select" on public.qc_reviews;
create policy "qc reviews select" on public.qc_reviews for select using (true);

drop policy if exists "qc reviews modify" on public.qc_reviews;
create policy "qc reviews modify" on public.qc_reviews for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

comment on table public.qc_reviews is 'QC approvals and rejections for picked quantities per size';
comment on column public.qc_reviews.approved_quantity is 'Approved pieces after QC';
comment on column public.qc_reviews.rejected_quantity is 'Rejected pieces after QC';


-- Create production_team table
CREATE TABLE IF NOT EXISTS production_team (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_code VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(20) NOT NULL,
    personal_email VARCHAR(255),
    personal_phone VARCHAR(20) NOT NULL,
    address_line1 TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    designation VARCHAR(100) NOT NULL CHECK (designation IN ('Pattern Master', 'Cutting Manager', 'Tailor')),
    joining_date DATE NOT NULL,
    employment_type VARCHAR(50) DEFAULT 'Full-time',
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_production_team_designation ON production_team(designation);
CREATE INDEX IF NOT EXISTS idx_production_team_employee_code ON production_team(employee_code);

-- Insert sample data
INSERT INTO production_team (
    employee_code, 
    full_name, 
    date_of_birth, 
    gender, 
    personal_email, 
    personal_phone, 
    address_line1, 
    city, 
    state, 
    pincode, 
    designation, 
    joining_date, 
    employment_type
) VALUES 
('PT001', 'Rajesh Kumar', '1985-03-15', 'Male', 'rajesh.kumar@example.com', '+91-9876543210', '123 Main Street', 'Mumbai', 'Maharashtra', '400001', 'Pattern Master', '2020-01-15', 'Full-time'),
('PT002', 'Priya Sharma', '1990-07-22', 'Female', 'priya.sharma@example.com', '+91-9876543211', '456 Park Avenue', 'Delhi', 'Delhi', '110001', 'Cutting Manager', '2019-06-10', 'Full-time'),
('PT003', 'Amit Patel', '1988-11-08', 'Male', 'amit.patel@example.com', '+91-9876543212', '789 Lake Road', 'Ahmedabad', 'Gujarat', '380001', 'Tailor', '2021-03-20', 'Full-time'),
('PT004', 'Sunita Verma', '1992-04-12', 'Female', 'sunita.verma@example.com', '+91-9876543213', '321 Garden Street', 'Bangalore', 'Karnataka', '560001', 'Pattern Master', '2018-09-05', 'Full-time'),
('PT005', 'Vikram Singh', '1987-12-30', 'Male', 'vikram.singh@example.com', '+91-9876543214', '654 Hill View', 'Chennai', 'Tamil Nadu', '600001', 'Cutting Manager', '2020-11-18', 'Full-time'),
('PT006', 'Meera Reddy', '1991-08-25', 'Female', 'meera.reddy@example.com', '+91-9876543215', '987 Beach Road', 'Hyderabad', 'Telangana', '500001', 'Tailor', '2022-01-30', 'Full-time'),
('PT007', 'Arun Kumar', '1986-05-18', 'Male', 'arun.kumar@example.com', '+91-9876543216', '147 Temple Street', 'Pune', 'Maharashtra', '411001', 'Pattern Master', '2019-12-03', 'Full-time'),
('PT008', 'Kavita Joshi', '1993-01-14', 'Female', 'kavita.joshi@example.com', '+91-9876543217', '258 Market Road', 'Jaipur', 'Rajasthan', '302001', 'Tailor', '2021-07-12', 'Full-time');

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_production_team_updated_at ON production_team;
CREATE TRIGGER update_production_team_updated_at 
    BEFORE UPDATE ON production_team 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
-- Create table for multiple cutting master assignments per order
CREATE TABLE IF NOT EXISTS public.order_cutting_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  cutting_master_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  cutting_master_name TEXT NOT NULL,
  cutting_master_avatar_url TEXT,
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  assigned_by_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  assigned_by_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_order_cutting_assignments_order_master UNIQUE(order_id, cutting_master_id)
);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_cutting_assignments_updated_at ON public.order_cutting_assignments;
CREATE TRIGGER trg_order_cutting_assignments_updated_at
BEFORE UPDATE ON public.order_cutting_assignments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_order_cutting_assignments_order_id ON public.order_cutting_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_cutting_assignments_cutting_master_id ON public.order_cutting_assignments(cutting_master_id);
CREATE INDEX IF NOT EXISTS idx_order_cutting_assignments_assigned_by_id ON public.order_cutting_assignments(assigned_by_id);

-- Enable RLS and allow authenticated users to manage
ALTER TABLE public.order_cutting_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth select order_cutting_assignments" ON public.order_cutting_assignments;
DROP POLICY IF EXISTS "auth manage order_cutting_assignments" ON public.order_cutting_assignments;

CREATE POLICY "auth select order_cutting_assignments" ON public.order_cutting_assignments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth manage order_cutting_assignments" ON public.order_cutting_assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add comment
COMMENT ON TABLE public.order_cutting_assignments IS 'Multiple cutting master assignments per order';
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

DROP TRIGGER IF EXISTS update_product_master_updated_at ON product_master;
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

-- Add foreign key constraints to tables that reference product_master
DO $$
BEGIN
    -- Add FK to inventory_adjustment_items if both tables exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_adjustment_items')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_master')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_adjustment_items' AND column_name = 'product_id')
       AND NOT EXISTS (
           SELECT 1 FROM information_schema.table_constraints 
           WHERE constraint_name = 'inventory_adjustment_items_product_id_fkey'
       ) THEN
        ALTER TABLE inventory_adjustment_items 
        ADD CONSTRAINT inventory_adjustment_items_product_id_fkey 
        FOREIGN KEY (product_id) REFERENCES product_master(id);
    END IF;
    
    -- Add FK to inventory_adjustment_logs if both tables exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_adjustment_logs')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_master')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_adjustment_logs' AND column_name = 'product_id')
       AND NOT EXISTS (
           SELECT 1 FROM information_schema.table_constraints 
           WHERE constraint_name = 'inventory_adjustment_logs_product_id_fkey'
       ) THEN
        ALTER TABLE inventory_adjustment_logs 
        ADD CONSTRAINT inventory_adjustment_logs_product_id_fkey 
        FOREIGN KEY (product_id) REFERENCES product_master(id);
    END IF;
END $$;

-- Update product_master table to match the required fields from the image
-- This migration adds missing fields and ensures all required columns exist

DO $$
BEGIN
  -- Add sku if it doesn't exist (might be product_id in some schemas)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'sku'
  ) THEN
    ALTER TABLE product_master ADD COLUMN sku TEXT;
    -- If product_id exists and is unique, copy to sku
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'product_id'
    ) THEN
      UPDATE product_master SET sku = product_id WHERE sku IS NULL;
    END IF;
    -- Create index on sku
    CREATE INDEX IF NOT EXISTS idx_product_master_sku ON product_master(sku);
  END IF;

  -- Add class if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'class'
  ) THEN
    ALTER TABLE product_master ADD COLUMN class TEXT;
  END IF;

  -- Add color if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'color'
  ) THEN
    ALTER TABLE product_master ADD COLUMN color TEXT;
  END IF;

  -- Add size_type if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'size_type'
  ) THEN
    ALTER TABLE product_master ADD COLUMN size_type TEXT;
  END IF;

  -- Add size if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'size'
  ) THEN
    ALTER TABLE product_master ADD COLUMN size TEXT;
  END IF;

  -- Add name/product if it doesn't exist (map to name)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'name'
  ) THEN
    -- If product_name exists, copy to name
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'product_name'
    ) THEN
      ALTER TABLE product_master ADD COLUMN name TEXT;
      UPDATE product_master SET name = product_name WHERE name IS NULL;
    ELSE
      ALTER TABLE product_master ADD COLUMN name TEXT;
    END IF;
  END IF;

  -- Add material if it doesn't exist (map to fabric if fabric exists)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'material'
  ) THEN
    ALTER TABLE product_master ADD COLUMN material TEXT;
    -- If fabric exists, copy to material
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'fabric'
    ) THEN
      UPDATE product_master SET material = fabric WHERE material IS NULL;
    END IF;
  END IF;

  -- Ensure brand exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'brand'
  ) THEN
    ALTER TABLE product_master ADD COLUMN brand TEXT;
  END IF;

  -- Ensure category exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'category'
  ) THEN
    -- If product_category exists, copy to category
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'product_category'
    ) THEN
      ALTER TABLE product_master ADD COLUMN category TEXT;
      UPDATE product_master SET category = product_category WHERE category IS NULL;
    ELSE
      ALTER TABLE product_master ADD COLUMN category TEXT;
    END IF;
  END IF;

  -- Add gender if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'gender'
  ) THEN
    ALTER TABLE product_master ADD COLUMN gender TEXT;
  END IF;

  -- Ensure mrp exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'mrp'
  ) THEN
    ALTER TABLE product_master ADD COLUMN mrp DECIMAL(10,2) DEFAULT 0;
  END IF;

  -- Add cost if it doesn't exist (map to cost_price)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'cost'
  ) THEN
    ALTER TABLE product_master ADD COLUMN cost DECIMAL(10,2) DEFAULT 0;
    -- If cost_price exists, copy to cost
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'cost_price'
    ) THEN
      UPDATE product_master SET cost = COALESCE(cost_price, 0) WHERE cost = 0;
    END IF;
  END IF;

  -- Ensure selling_price exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'selling_price'
  ) THEN
    ALTER TABLE product_master ADD COLUMN selling_price DECIMAL(10,2) DEFAULT 0;
  END IF;

  -- Ensure gst_rate exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'gst_rate'
  ) THEN
    ALTER TABLE product_master ADD COLUMN gst_rate DECIMAL(5,2) DEFAULT 0;
  END IF;

  -- Add hsn if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'hsn'
  ) THEN
    ALTER TABLE product_master ADD COLUMN hsn TEXT;
  END IF;

  -- Add main_image if it doesn't exist (map to image_url if exists)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'main_image'
  ) THEN
    ALTER TABLE product_master ADD COLUMN main_image TEXT;
    -- If image_url exists, copy to main_image
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'image_url'
    ) THEN
      UPDATE product_master SET main_image = image_url WHERE main_image IS NULL;
    END IF;
  END IF;

  -- Add image1 if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'image1'
  ) THEN
    ALTER TABLE product_master ADD COLUMN image1 TEXT;
    -- If images array exists and has first element, copy to image1
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'images'
      AND data_type = 'ARRAY'
    ) THEN
      -- Update where images array has at least one element
      UPDATE product_master 
      SET image1 = (images[1])::TEXT 
      WHERE images IS NOT NULL 
      AND array_length(images, 1) > 0 
      AND image1 IS NULL;
    END IF;
  END IF;

  -- Add image2 if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'image2'
  ) THEN
    ALTER TABLE product_master ADD COLUMN image2 TEXT;
    -- If images array exists and has second element, copy to image2
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'images'
      AND data_type = 'ARRAY'
    ) THEN
      -- Update where images array has at least two elements
      UPDATE product_master 
      SET image2 = (images[2])::TEXT 
      WHERE images IS NOT NULL 
      AND array_length(images, 1) > 1 
      AND image2 IS NULL;
    END IF;
  END IF;

  -- Ensure created_at exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE product_master ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- Ensure updated_at exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE product_master ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_product_master_sku ON product_master(sku);
CREATE INDEX IF NOT EXISTS idx_product_master_class ON product_master(class);
CREATE INDEX IF NOT EXISTS idx_product_master_color ON product_master(color);
CREATE INDEX IF NOT EXISTS idx_product_master_size_type ON product_master(size_type);
CREATE INDEX IF NOT EXISTS idx_product_master_category ON product_master(category);
CREATE INDEX IF NOT EXISTS idx_product_master_brand ON product_master(brand);
CREATE INDEX IF NOT EXISTS idx_product_master_gender ON product_master(gender);

-- Create or replace updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$ language 'plpgsql';

-- Create or replace updated_at trigger
DROP TRIGGER IF EXISTS update_product_master_updated_at ON product_master;
CREATE TRIGGER update_product_master_updated_at 
    BEFORE UPDATE ON product_master 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation (with column checks)
DO $$
BEGIN
    -- Table comment (always safe)
    EXECUTE 'COMMENT ON TABLE product_master IS ''Master table for products with all required fields for product management''';
    
    -- Column comments (only if columns exist)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_master' AND column_name = 'sku') THEN
        EXECUTE 'COMMENT ON COLUMN product_master.sku IS ''Stock Keeping Unit - Unique product identifier''';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_master' AND column_name = 'class') THEN
        EXECUTE 'COMMENT ON COLUMN product_master.class IS ''Product class/category code''';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_master' AND column_name = 'color') THEN
        EXECUTE 'COMMENT ON COLUMN product_master.color IS ''Product color''';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_master' AND column_name = 'size_type') THEN
        EXECUTE 'COMMENT ON COLUMN product_master.size_type IS ''Size type system (e.g., MEN-ALPHA)''';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_master' AND column_name = 'size') THEN
        EXECUTE 'COMMENT ON COLUMN product_master.size IS ''Specific size (S, M, L, XL, 2XL, etc.)''';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_master' AND column_name = 'name') THEN
        EXECUTE 'COMMENT ON COLUMN product_master.name IS ''Product name''';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_master' AND column_name = 'material') THEN
        EXECUTE 'COMMENT ON COLUMN product_master.material IS ''Material composition (e.g., polyester)''';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_master' AND column_name = 'cost') THEN
        EXECUTE 'COMMENT ON COLUMN product_master.cost IS ''Cost price''';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_master' AND column_name = 'main_image') THEN
        EXECUTE 'COMMENT ON COLUMN product_master.main_image IS ''Main product image URL''';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_master' AND column_name = 'image1') THEN
        EXECUTE 'COMMENT ON COLUMN product_master.image1 IS ''Additional product image 1 URL''';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_master' AND column_name = 'image2') THEN
        EXECUTE 'COMMENT ON COLUMN product_master.image2 IS ''Additional product image 2 URL''';
    END IF;
END $$;

-- Add customer authentication and role-based access

-- Create customer_users table to link customers with auth users
CREATE TABLE IF NOT EXISTS customer_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(customer_id, user_id)
);

-- Add customer role to user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'customer';

-- Create customer portal settings table
CREATE TABLE IF NOT EXISTS customer_portal_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    can_view_orders BOOLEAN DEFAULT true,
    can_view_invoices BOOLEAN DEFAULT true,
    can_view_quotations BOOLEAN DEFAULT true,
    can_view_production_status BOOLEAN DEFAULT true,
    can_download_documents BOOLEAN DEFAULT true,
    can_request_changes BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create customer activity log
CREATE TABLE IF NOT EXISTS customer_activity_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS policies for customer data access
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_activity_log ENABLE ROW LEVEL SECURITY;

-- Policy for customers to see only their orders
CREATE POLICY "Customers can view own orders" ON orders
    FOR SELECT USING (
        customer_id IN (
            SELECT customer_id FROM customer_users 
            WHERE user_id = auth.uid()
        )
    );

-- Policy for customers to see only their invoices
CREATE POLICY "Customers can view own invoices" ON invoices
    FOR SELECT USING (
        customer_id IN (
            SELECT customer_id FROM customer_users 
            WHERE user_id = auth.uid()
        )
    );

-- Policy for customers to see only their quotations
CREATE POLICY "Customers can view own quotations" ON quotations
    FOR SELECT USING (
        customer_id IN (
            SELECT customer_id FROM customer_users 
            WHERE user_id = auth.uid()
        )
    );

-- Policy for customers to see only their activity log
CREATE POLICY "Customers can view own activity" ON customer_activity_log
    FOR SELECT USING (
        customer_id IN (
            SELECT customer_id FROM customer_users 
            WHERE user_id = auth.uid()
        )
    );

-- Function to create customer user
CREATE OR REPLACE FUNCTION create_customer_user(
    customer_email TEXT,
    customer_password TEXT,
    customer_id UUID
) RETURNS UUID AS $$
DECLARE
    new_user_id UUID;
BEGIN
    -- Create auth user
    INSERT INTO auth.users (
        email,
        encrypted_password,
        email_confirmed_at,
        created_at,
        updated_at
    ) VALUES (
        customer_email,
        crypt(customer_password, gen_salt('bf')),
        NOW(),
        NOW(),
        NOW()
    ) RETURNING id INTO new_user_id;

    -- Link to customer
    INSERT INTO customer_users (customer_id, user_id)
    VALUES (customer_id, new_user_id);

    -- Create profile
    INSERT INTO profiles (user_id, email, full_name, role)
    VALUES (new_user_id, customer_email, 'Customer', 'customer');

    RETURN new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; -- Enforce customer portal permissions in RLS for orders, invoices, and quotations
-- Customers can only view their own data AND only if their portal permission flag is enabled

-- ORDERS
-- Drop overly broad policies
DROP POLICY IF EXISTS "Authenticated users can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can manage orders" ON public.orders;

-- Restrict customers to view only their orders when permission is granted
DROP POLICY IF EXISTS "Customers can view own orders with permission" ON public.orders;
CREATE POLICY "Customers can view own orders with permission"
ON public.orders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.customer_users cu
    JOIN public.customer_portal_settings s ON s.customer_id = cu.customer_id
    WHERE cu.user_id = auth.uid()
      AND cu.customer_id = public.orders.customer_id
      AND COALESCE(s.can_view_orders, false) = true
  )
);

-- Admins can view all orders
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
CREATE POLICY "Admins can view all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'admin'
  )
);

-- Staff (non-customer) can view all orders
DROP POLICY IF EXISTS "Staff can view all orders" ON public.orders;
CREATE POLICY "Staff can view all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role <> 'customer'
  )
);

-- INVOICES
-- Drop overly broad policies
DROP POLICY IF EXISTS "Authenticated users can view all invoices" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated users can manage invoices" ON public.invoices;

-- Restrict customers to view only their invoices when permission is granted
DROP POLICY IF EXISTS "Customers can view own invoices with permission" ON public.invoices;
CREATE POLICY "Customers can view own invoices with permission"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.customer_users cu
    JOIN public.customer_portal_settings s ON s.customer_id = cu.customer_id
    WHERE cu.user_id = auth.uid()
      AND cu.customer_id = public.invoices.customer_id
      AND COALESCE(s.can_view_invoices, false) = true
  )
);

-- Admins can view all invoices
DROP POLICY IF EXISTS "Admins can view all invoices" ON public.invoices;
CREATE POLICY "Admins can view all invoices"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'admin'
  )
);

-- Staff (non-customer) can view all invoices
DROP POLICY IF EXISTS "Staff can view all invoices" ON public.invoices;
CREATE POLICY "Staff can view all invoices"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role <> 'customer'
  )
);

-- QUOTATIONS
-- Drop overly broad policy
DROP POLICY IF EXISTS "Authenticated users can manage quotations" ON public.quotations;

-- Replace customer view policy with permission-aware version
DROP POLICY IF EXISTS "Customers can view own quotations" ON public.quotations;
DROP POLICY IF EXISTS "Customers can view own quotations with permission" ON public.quotations;
CREATE POLICY "Customers can view own quotations with permission"
ON public.quotations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.customer_users cu
    JOIN public.customer_portal_settings s ON s.customer_id = cu.customer_id
    WHERE cu.user_id = auth.uid()
      AND cu.customer_id = public.quotations.customer_id
      AND COALESCE(s.can_view_quotations, false) = true
  )
);

-- Admins can view all quotations (retain or ensure present)
DROP POLICY IF EXISTS "Admins can view all quotations" ON public.quotations;
CREATE POLICY "Admins can view all quotations"
ON public.quotations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'admin'
  )
);

-- Staff (non-customer) can view all quotations
DROP POLICY IF EXISTS "Staff can view all quotations" ON public.quotations;
CREATE POLICY "Staff can view all quotations"
ON public.quotations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role <> 'customer'
  )
);

-- Notify PostgREST to reload schema
select pg_notify('pgrst','reload schema');


-- Create quotations table
CREATE TABLE IF NOT EXISTS quotations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quotation_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    quotation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    notes TEXT,
    terms_and_conditions TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create quotation_items table
CREATE TABLE IF NOT EXISTS quotation_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quotation_id UUID REFERENCES quotations(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on quotations
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;

-- Policy for customers to see only their quotations
CREATE POLICY "Customers can view own quotations" ON quotations
    FOR SELECT USING (
        customer_id IN (
            SELECT customer_id FROM customer_users 
            WHERE user_id = auth.uid()
        )
    );

-- Policy for admins to see all quotations
CREATE POLICY "Admins can view all quotations" ON quotations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE user_id = auth.uid() 
            AND role = 'admin'
        )
    ); -- Product Parts and Customization System Database Schema
-- Run this in Supabase SQL Editor

-- Step 1: Create product_parts table
CREATE TABLE IF NOT EXISTS product_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_name VARCHAR(100) NOT NULL UNIQUE,
    part_type VARCHAR(50) NOT NULL CHECK (part_type IN ('dropdown', 'number')),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Create product_category_parts linking table (many-to-many)
CREATE TABLE IF NOT EXISTS product_category_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_category_id UUID REFERENCES product_categories(id) ON DELETE CASCADE,
    part_id UUID REFERENCES product_parts(id) ON DELETE CASCADE,
    is_required BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_category_id, part_id)
);

-- Step 3: Create part_addons table for dropdown options
CREATE TABLE IF NOT EXISTS part_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_id UUID REFERENCES product_parts(id) ON DELETE CASCADE,
    addon_name VARCHAR(100) NOT NULL,
    addon_value VARCHAR(100),
    price_adjustment DECIMAL(10,2) DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 4: Create order_item_customizations table to store user selections
CREATE TABLE IF NOT EXISTS order_item_customizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id UUID REFERENCES order_items(id) ON DELETE CASCADE,
    part_id UUID REFERENCES product_parts(id) ON DELETE CASCADE,
    selected_addon_id UUID REFERENCES part_addons(id), -- For dropdown parts
    custom_value VARCHAR(100), -- For number input parts
    quantity INTEGER DEFAULT 1, -- For number parts
    price_impact DECIMAL(10,2) DEFAULT 0, -- Calculated price impact
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 5: Create indexes for better performance (with column checks)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_parts' AND column_name = 'part_name') THEN
        CREATE INDEX IF NOT EXISTS idx_product_parts_name ON product_parts(part_name);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_parts' AND column_name = 'part_type') THEN
        CREATE INDEX IF NOT EXISTS idx_product_parts_type ON product_parts(part_type);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_category_parts' AND column_name = 'product_category_id') THEN
        CREATE INDEX IF NOT EXISTS idx_product_category_parts_category ON product_category_parts(product_category_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_category_parts' AND column_name = 'part_id') THEN
        CREATE INDEX IF NOT EXISTS idx_product_category_parts_part ON product_category_parts(part_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'part_addons' AND column_name = 'part_id') THEN
        CREATE INDEX IF NOT EXISTS idx_part_addons_part ON part_addons(part_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_item_customizations' AND column_name = 'order_item_id') THEN
        CREATE INDEX IF NOT EXISTS idx_order_item_customizations_item ON order_item_customizations(order_item_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_item_customizations' AND column_name = 'part_id') THEN
        CREATE INDEX IF NOT EXISTS idx_order_item_customizations_part ON order_item_customizations(part_id);
    END IF;
END $$;

-- Step 6: Enable Row Level Security
ALTER TABLE product_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_category_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE part_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_customizations ENABLE ROW LEVEL SECURITY;

-- Step 7: Create RLS policies
-- Product Parts policies
CREATE POLICY "Users can view product parts" ON product_parts
    FOR SELECT USING (true);

CREATE POLICY "Users can insert product parts" ON product_parts
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update product parts" ON product_parts
    FOR UPDATE USING (true);

CREATE POLICY "Users can delete product parts" ON product_parts
    FOR DELETE USING (true);

-- Product Category Parts policies
CREATE POLICY "Users can view product category parts" ON product_category_parts
    FOR SELECT USING (true);

CREATE POLICY "Users can insert product category parts" ON product_category_parts
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update product category parts" ON product_category_parts
    FOR UPDATE USING (true);

CREATE POLICY "Users can delete product category parts" ON product_category_parts
    FOR DELETE USING (true);

-- Part Addons policies
CREATE POLICY "Users can view part addons" ON part_addons
    FOR SELECT USING (true);

CREATE POLICY "Users can insert part addons" ON part_addons
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update part addons" ON part_addons
    FOR UPDATE USING (true);

CREATE POLICY "Users can delete part addons" ON part_addons
    FOR DELETE USING (true);

-- Order Item Customizations policies
CREATE POLICY "Users can view order item customizations" ON order_item_customizations
    FOR SELECT USING (true);

CREATE POLICY "Users can insert order item customizations" ON order_item_customizations
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update order item customizations" ON order_item_customizations
    FOR UPDATE USING (true);

CREATE POLICY "Users can delete order item customizations" ON order_item_customizations
    FOR DELETE USING (true);

-- Step 8: Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_product_parts_updated_at ON product_parts;
CREATE TRIGGER update_product_parts_updated_at 
    BEFORE UPDATE ON product_parts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_part_addons_updated_at ON part_addons;
CREATE TRIGGER update_part_addons_updated_at 
    BEFORE UPDATE ON part_addons 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Step 9: Insert some sample data
INSERT INTO product_parts (part_name, part_type, description) VALUES
('Sleeve Length', 'dropdown', 'Choose sleeve length for the garment'),
('Number of Buttons', 'number', 'Specify number of buttons required'),
('Collar Style', 'dropdown', 'Select collar style'),
('Pocket Type', 'dropdown', 'Choose pocket configuration'),
('Fabric Weight', 'number', 'Specify fabric weight in GSM');

-- Insert sample addons for dropdown parts
INSERT INTO part_addons (part_id, addon_name, addon_value, price_adjustment, sort_order) 
SELECT 
    pp.id,
    addon_data.addon_name,
    addon_data.addon_value,
    addon_data.price_adjustment,
    addon_data.sort_order
FROM product_parts pp
CROSS JOIN (
    VALUES 
        ('Sleeve Length', 'Short Sleeve', 'short', 0, 1),
        ('Sleeve Length', 'Long Sleeve', 'long', 50, 2),
        ('Sleeve Length', 'No Sleeve', 'none', -20, 3),
        ('Collar Style', 'Round Neck', 'round', 0, 1),
        ('Collar Style', 'V Neck', 'v-neck', 30, 2),
        ('Collar Style', 'Polo Collar', 'polo', 100, 3),
        ('Pocket Type', 'No Pockets', 'none', 0, 1),
        ('Pocket Type', 'Chest Pocket', 'chest', 80, 2),
        ('Pocket Type', 'Side Pockets', 'side', 150, 3)
) AS addon_data(part_name, addon_name, addon_value, price_adjustment, sort_order)
WHERE pp.part_name = addon_data.part_name;

-- Add comments
COMMENT ON TABLE product_parts IS 'Product parts that can be customized (e.g., Sleeve Length, Number of Buttons)';
COMMENT ON TABLE product_category_parts IS 'Links product categories to available parts for customization';
COMMENT ON TABLE part_addons IS 'Available options for dropdown-type parts';
COMMENT ON TABLE order_item_customizations IS 'Stores user-selected customizations for order items';

-- Success message
SELECT 'Product parts and customization system created successfully!' as status;
-- Create supplier_master table
CREATE TABLE IF NOT EXISTS supplier_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_code TEXT NOT NULL UNIQUE,
  supplier_name TEXT NOT NULL,
  credit_limit DECIMAL(12,2) DEFAULT 0,
  pan TEXT,
  gst_number TEXT,
  primary_contact_name TEXT,
  primary_contact_email TEXT,
  primary_contact_phone TEXT,
  billing_address_line1 TEXT NOT NULL,
  billing_address_line2 TEXT,
  billing_address_city TEXT NOT NULL,
  billing_address_state TEXT NOT NULL,
  billing_address_country TEXT DEFAULT 'India',
  billing_address_pincode TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  total_outstanding_amount DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create supplier_specializations table to track what suppliers specialize in
CREATE TABLE IF NOT EXISTS supplier_specializations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES supplier_master(id) ON DELETE CASCADE,
  specialization_type TEXT NOT NULL CHECK (specialization_type IN ('fabric', 'item', 'product')),
  specialization_id UUID NOT NULL, -- References fabric_id, item_id, or product_id
  specialization_name TEXT NOT NULL, -- Denormalized name for easy querying
  priority INTEGER DEFAULT 1, -- Higher number = higher priority
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supplier_id, specialization_type, specialization_id)
);

-- Create indexes for better performance (with column checks)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_master' AND column_name = 'supplier_code') THEN
        CREATE INDEX IF NOT EXISTS idx_supplier_master_code ON supplier_master(supplier_code);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_master' AND column_name = 'enabled') THEN
        CREATE INDEX IF NOT EXISTS idx_supplier_master_enabled ON supplier_master(enabled);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_specializations' AND column_name = 'supplier_id') THEN
        CREATE INDEX IF NOT EXISTS idx_supplier_specializations_supplier ON supplier_specializations(supplier_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_specializations' AND column_name = 'specialization_type') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_specializations' AND column_name = 'specialization_id') THEN
        CREATE INDEX IF NOT EXISTS idx_supplier_specializations_type_id ON supplier_specializations(specialization_type, specialization_id);
    END IF;
END $$;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_supplier_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_update_supplier_updated_at ON supplier_master;
CREATE TRIGGER trigger_update_supplier_updated_at
  BEFORE UPDATE ON supplier_master
  FOR EACH ROW
  EXECUTE FUNCTION update_supplier_updated_at();

-- Create function to get best suppliers for a given item/product/fabric
CREATE OR REPLACE FUNCTION get_best_suppliers(
  p_specialization_type TEXT,
  p_specialization_id UUID,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  supplier_id UUID,
  supplier_code TEXT,
  supplier_name TEXT,
  primary_contact_phone TEXT,
  primary_contact_email TEXT,
  total_outstanding_amount DECIMAL(12,2),
  priority INTEGER,
  credit_limit DECIMAL(12,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sm.id as supplier_id,
    sm.supplier_code,
    sm.supplier_name,
    sm.primary_contact_phone,
    sm.primary_contact_email,
    sm.total_outstanding_amount,
    ss.priority,
    sm.credit_limit
  FROM supplier_master sm
  INNER JOIN supplier_specializations ss ON sm.id = ss.supplier_id
  WHERE sm.enabled = true
    AND ss.specialization_type = p_specialization_type
    AND ss.specialization_id = p_specialization_id
  ORDER BY ss.priority DESC, sm.total_outstanding_amount ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
-- Create order_assignments table to persist production assignments
create table if not exists public.order_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  cutting_master_id uuid null references public.employees(id) on delete set null,
  cutting_master_name text null,
  cutting_work_date date null,
  pattern_master_id uuid null references public.employees(id) on delete set null,
  pattern_master_name text null,
  pattern_work_date date null,
  cut_quantity numeric null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_order_assignments_order unique(order_id)
);

-- Trigger to update updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_order_assignments_updated_at on public.order_assignments;
create trigger trg_order_assignments_updated_at
before update on public.order_assignments
for each row execute function public.set_updated_at();

-- Indexes
create index if not exists idx_order_assignments_order_id on public.order_assignments(order_id);
create index if not exists idx_order_assignments_cutting_master_id on public.order_assignments(cutting_master_id);
create index if not exists idx_order_assignments_pattern_master_id on public.order_assignments(pattern_master_id);

-- Enable RLS and allow authenticated users to manage
alter table public.order_assignments enable row level security;

drop policy if exists "auth select order_assignments" on public.order_assignments;
drop policy if exists "auth manage order_assignments" on public.order_assignments;

create policy "auth select order_assignments" on public.order_assignments
  for select to authenticated using (true);

create policy "auth manage order_assignments" on public.order_assignments
  for all to authenticated using (true) with check (true);

-- QC reviews to approve/reject picked quantities per batch assignment and size

create table if not exists public.qc_reviews (
  id uuid primary key default gen_random_uuid(),
  order_batch_assignment_id uuid not null references public.order_batch_assignments(id) on delete cascade,
  size_name text not null,
  picked_quantity integer not null default 0,
  approved_quantity integer not null default 0,
  rejected_quantity integer not null default 0,
  remarks text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique(order_batch_assignment_id, size_name)
);

alter table public.qc_reviews enable row level security;

drop policy if exists "qc reviews select" on public.qc_reviews;
create policy "qc reviews select" on public.qc_reviews for select using (true);

drop policy if exists "qc reviews modify" on public.qc_reviews;
create policy "qc reviews modify" on public.qc_reviews for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

comment on table public.qc_reviews is 'QC approvals and rejections for picked quantities per size';
comment on column public.qc_reviews.approved_quantity is 'Approved pieces after QC';
comment on column public.qc_reviews.rejected_quantity is 'Rejected pieces after QC';


-- ============================================================================
-- CREATE VIEWS FOR COMPLEX QUERIES
-- Generated: October 8, 2025
-- Description: Creates all necessary views referenced in the application code
-- ============================================================================

-- ============================================================================
-- 1. ORDER LIFECYCLE VIEW
-- ============================================================================
DROP VIEW IF EXISTS order_lifecycle_view CASCADE;
CREATE VIEW order_lifecycle_view AS
SELECT 
    o.id as order_id,
    o.order_number,
    o.status as current_status,
    o.created_at as order_created,
    po.created_at as production_started,
    qc.check_date as quality_checked,
    disp.dispatch_date as dispatched,
    CASE 
        WHEN o.status = 'pending' THEN 'Order Placed'
        WHEN o.status = 'in_production' THEN 'In Production'
        WHEN qc.status = 'passed' THEN 'Quality Checked'
        WHEN disp.status = 'delivered' THEN 'Delivered'
        ELSE 'In Progress'
    END as activity_type,
    CASE 
        WHEN o.status = 'pending' THEN o.created_at
        WHEN o.status = 'in_production' THEN po.created_at
        WHEN qc.status = 'passed' THEN qc.check_date::timestamp
        WHEN disp.status = 'delivered' THEN disp.dispatch_date::timestamp
        ELSE o.updated_at
    END as performed_at
FROM orders o
LEFT JOIN production_orders po ON o.id = po.order_id
LEFT JOIN quality_checks qc ON o.id = qc.order_id
LEFT JOIN dispatch_orders disp ON o.id = disp.order_id;

-- ============================================================================
-- 2. ORDER BATCH ASSIGNMENTS WITH DETAILS VIEW
-- ============================================================================
DROP VIEW IF EXISTS order_batch_assignments_with_details CASCADE;
CREATE VIEW order_batch_assignments_with_details AS
SELECT 
    oba.id as assignment_id,
    oba.order_id,
    oba.batch_id,
    oba.batch_name,
    oba.batch_leader_id,
    oba.batch_leader_name,
    oba.batch_leader_avatar,
    oba.status,
    oba.priority,
    oba.total_quantity,
    oba.completed_quantity,
    oba.assigned_date,
    oba.expected_completion_date,
    oba.actual_completion_date,
    oba.notes,
    o.order_number,
    o.customer_id,
    c.company_name as customer_name,
    b.batch_code,
    b.max_capacity,
    b.current_capacity,
    oba.created_at,
    oba.updated_at
FROM order_batch_assignments oba
LEFT JOIN orders o ON oba.order_id = o.id
LEFT JOIN customers c ON o.customer_id = c.id
LEFT JOIN batches b ON oba.batch_id = b.id;

-- ============================================================================
-- 3. TAILOR MANAGEMENT VIEW
-- ============================================================================
DROP VIEW IF EXISTS tailor_management_view CASCADE;
CREATE VIEW tailor_management_view AS
SELECT
    t.id,
    t.tailor_code,
    t.full_name,
    t.avatar_url,
    t.skill_level,
    t.batch_id,
    t.is_batch_leader,
    t.status,
    t.personal_phone,
    t.personal_email,
    t.joining_date,
    t.employment_type,
    t.per_piece_rate,
    t.total_orders_completed,
    t.average_completion_time,
    t.quality_rating,
    t.efficiency_score,
    b.batch_name,
    b.batch_code,
    b.max_capacity,
    b.current_capacity,
    bl.full_name AS batch_leader_name,
    bl.avatar_url AS batch_leader_avatar,
    (SELECT COUNT(*) FROM tailor_assignments ta WHERE ta.tailor_id = t.id AND ta.status IN ('assigned', 'in_progress')) AS active_assignments,
    (SELECT COUNT(*) FROM tailor_assignments ta WHERE ta.tailor_id = t.id AND ta.status = 'completed') AS completed_assignments,
    t.created_at,
    t.updated_at
FROM tailors t
LEFT JOIN batches b ON t.batch_id = b.id
LEFT JOIN tailors bl ON b.batch_leader_id = bl.id;

-- ============================================================================
-- 4. QC REVIEWS VIEW (Quality Check Reviews)
-- ============================================================================
DROP VIEW IF EXISTS qc_reviews CASCADE;
CREATE VIEW qc_reviews AS
SELECT
    qc.id,
    qc.order_id,
    qc.production_order_id,
    qc.check_date,
    qc.checked_by,
    qc.status,
    qc.pass_percentage,
    qc.rework_required,
    qc.notes,
    qc.defects_found,
    o.order_number,
    o.customer_id,
    c.company_name as customer_name,
    po.production_number,
    e.full_name as checker_name,
    e.avatar_url as checker_avatar,
    -- Calculate approved and rejected quantities based on pass_percentage
    COALESCE(oi.quantity, 0) as total_quantity,
    ROUND(COALESCE(oi.quantity, 0) * COALESCE(qc.pass_percentage, 0) / 100, 0) as approved_quantity,
    ROUND(COALESCE(oi.quantity, 0) * (100 - COALESCE(qc.pass_percentage, 0)) / 100, 0) as rejected_quantity,
    qc.created_at
FROM quality_checks qc
LEFT JOIN orders o ON qc.order_id = o.id
LEFT JOIN customers c ON o.customer_id = c.id
LEFT JOIN production_orders po ON qc.production_order_id = po.id
LEFT JOIN employees e ON qc.checked_by = e.id
LEFT JOIN (
    SELECT order_id, SUM(quantity) as quantity
    FROM order_items
    GROUP BY order_id
) oi ON qc.order_id = oi.order_id;

-- Add order_batch_assignment_id column for compatibility
-- This requires creating a mapping between quality_checks and order_batch_assignments
-- For now, we'll use a simple approach
ALTER TABLE quality_checks ADD COLUMN IF NOT EXISTS order_batch_assignment_id UUID REFERENCES order_batch_assignments(id);

-- ============================================================================
-- 5. GOODS RECEIPT NOTES VIEW (Alternative name for grn_master)
-- ============================================================================
DROP VIEW IF EXISTS goods_receipt_notes CASCADE;
CREATE VIEW goods_receipt_notes AS
SELECT 
    gm.id,
    gm.grn_number,
    gm.po_id,
    gm.supplier_id,
    gm.grn_date,
    gm.received_date,
    gm.received_by,
    gm.received_at_location,
    gm.status,
    gm.total_items_received,
    gm.total_items_approved,
    gm.total_items_rejected,
    gm.total_amount_received,
    gm.total_amount_approved,
    gm.quality_inspector,
    gm.inspection_date,
    gm.inspection_notes,
    gm.approved_by,
    gm.approved_at,
    gm.rejection_reason,
    po.po_number,
    po.order_date as po_date,
    sm.supplier_name,
    sm.supplier_code,
    gm.created_by,
    gm.created_at,
    gm.updated_at
FROM grn_master gm
LEFT JOIN purchase_orders po ON gm.po_id = po.id
LEFT JOIN supplier_master sm ON gm.supplier_id = sm.id;

-- ============================================================================
-- 6. WAREHOUSE INVENTORY SUMMARY VIEW
-- ============================================================================
DROP VIEW IF EXISTS warehouse_inventory_summary CASCADE;
CREATE VIEW warehouse_inventory_summary AS
SELECT
    wi.id,
    wi.warehouse_id,
    wi.bin_id,
    wi.item_id,
    wi.fabric_id,
    wi.quantity,
    wi.reserved_quantity,
    wi.available_quantity,
    wi.unit,
    wi.batch_number,
    wi.location,
    COALESCE(w.name, wm.warehouse_name) as warehouse_name,
    COALESCE(w.code, wm.warehouse_code) as warehouse_code,
    b.bin_code,
    b.location_type as bin_location_type,
    COALESCE(im.item_name, f.name) as item_name,
    COALESCE(im.item_code, '') as item_code,
    wi.last_updated,
    wi.created_at
FROM warehouse_inventory wi
LEFT JOIN warehouses w ON wi.warehouse_id = w.id
LEFT JOIN warehouse_master wm ON wi.warehouse_id = wm.id
LEFT JOIN bins b ON wi.bin_id = b.id
LEFT JOIN item_master im ON wi.item_id = im.id
LEFT JOIN fabrics f ON wi.fabric_id = f.id;

-- ============================================================================
-- 7. FABRIC STOCK SUMMARY VIEW
-- ============================================================================
DROP VIEW IF EXISTS fabric_stock_summary CASCADE;
CREATE VIEW fabric_stock_summary AS
SELECT
    f.id as fabric_id,
    f.name as fabric_name,
    fv.id as variant_id,
    fv.color,
    fv.gsm,
    fv.hex_code,
    COALESCE(SUM(fi.quantity), 0) as total_quantity,
    COALESCE(SUM(fi.reserved_quantity), 0) as total_reserved,
    COALESCE(SUM(fi.available_quantity), 0) as total_available,
    fv.uom as unit,
    fv.rate_per_meter,
    fv.stock_quantity as variant_stock,
    COUNT(DISTINCT fi.warehouse_id) as warehouse_count,
    f.image_url,
    fv.image_url as variant_image_url
FROM fabrics f
LEFT JOIN fabric_variants fv ON f.id = fv.fabric_id
LEFT JOIN fabric_inventory fi ON fv.id = fi.fabric_id
GROUP BY f.id, f.name, fv.id, fv.color, fv.gsm, fv.hex_code, fv.uom, fv.rate_per_meter, fv.stock_quantity, f.image_url, fv.image_url;

-- ============================================================================
-- 8. ORDER CUTTING ASSIGNMENTS VIEW
-- ============================================================================
DROP VIEW IF EXISTS order_cutting_assignments CASCADE;
CREATE VIEW order_cutting_assignments AS
SELECT
    oa.id,
    oa.order_id,
    oa.cutting_master_id,
    oa.cutting_master_name,
    oa.cutting_work_date,
    oa.pattern_master_id,
    oa.pattern_master_name,
    oa.pattern_work_date,
    oa.cut_quantity,
    o.order_number,
    o.customer_id,
    c.company_name as customer_name,
    cm.full_name as cutting_master_full_name,
    cm.avatar_url as cutting_master_avatar,
    pm.full_name as pattern_master_full_name,
    pm.avatar_url as pattern_master_avatar,
    oa.created_at,
    oa.updated_at
FROM order_assignments oa
LEFT JOIN orders o ON oa.order_id = o.id
LEFT JOIN customers c ON o.customer_id = c.id
LEFT JOIN employees cm ON oa.cutting_master_id = cm.id
LEFT JOIN employees pm ON oa.pattern_master_id = pm.id;

-- ============================================================================
-- 9. DISPATCH SUMMARY VIEW
-- ============================================================================
DROP VIEW IF EXISTS dispatch_summary CASCADE;
CREATE VIEW dispatch_summary AS
SELECT
    d.id as dispatch_id,
    d.dispatch_number,
    d.order_id,
    d.dispatch_date,
    d.courier_name,
    d.tracking_number,
    d.status,
    d.delivery_address,
    o.order_number,
    o.customer_id,
    c.company_name as customer_name,
    c.contact_person,
    c.phone as customer_phone,
    COALESCE(SUM(doi.quantity), 0) as total_dispatched_quantity,
    COUNT(DISTINCT doi.size_name) as size_count,
    d.created_at,
    d.updated_at
FROM dispatch_orders d
LEFT JOIN orders o ON d.order_id = o.id
LEFT JOIN customers c ON o.customer_id = c.id
LEFT JOIN dispatch_order_items doi ON d.id = doi.dispatch_order_id
GROUP BY d.id, d.dispatch_number, d.order_id, d.dispatch_date, d.courier_name, 
         d.tracking_number, d.status, d.delivery_address, o.order_number, 
         o.customer_id, c.company_name, c.contact_person, c.phone, d.created_at, d.updated_at;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
SELECT 'Successfully created all views!' as status;

COMMENT ON VIEW order_lifecycle_view IS 'Tracks order progression through different stages';
COMMENT ON VIEW order_batch_assignments_with_details IS 'Order batch assignments with full details including customer and batch info';
COMMENT ON VIEW tailor_management_view IS 'Comprehensive view of tailors with batch and assignment information';
COMMENT ON VIEW qc_reviews IS 'Quality check reviews with calculated approved/rejected quantities';
COMMENT ON VIEW goods_receipt_notes IS 'Alternative view for GRN master with purchase order and supplier details';
COMMENT ON VIEW warehouse_inventory_summary IS 'Warehouse inventory with location and item details';
COMMENT ON VIEW fabric_stock_summary IS 'Aggregated fabric stock across all warehouses';
COMMENT ON VIEW order_cutting_assignments IS 'Order cutting assignments with master details';
COMMENT ON VIEW dispatch_summary IS 'Dispatch orders with aggregated item quantities';


-- ============================================================================
-- ADDITIONAL MISSING TABLES
-- ============================================================================

-- Table: batch_assignments (linking batches to tailors/employees)
CREATE TABLE IF NOT EXISTS batch_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    tailor_id UUID REFERENCES tailors(id) ON DELETE SET NULL,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    assignment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    assigned_quantity INTEGER NOT NULL DEFAULT 0,
    completed_quantity INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: calendar_events
CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    event_type TEXT DEFAULT 'general',
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: page_items (for page/module management)
CREATE TABLE IF NOT EXISTS page_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_name TEXT NOT NULL UNIQUE,
    page_path TEXT NOT NULL,
    page_category TEXT,
    icon TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: user_page_permissions
CREATE TABLE IF NOT EXISTS user_page_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    page_item_id UUID NOT NULL REFERENCES page_items(id) ON DELETE CASCADE,
    can_view BOOLEAN DEFAULT false,
    can_create BOOLEAN DEFAULT false,
    can_edit BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, page_item_id)
);

-- Table: purchase_order_attachments
CREATE TABLE IF NOT EXISTS purchase_order_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT,
    file_size BIGINT,
    uploaded_by UUID REFERENCES auth.users(id),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: purchase_order_deliveries
CREATE TABLE IF NOT EXISTS purchase_order_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    purchase_order_item_id UUID REFERENCES purchase_order_items(id) ON DELETE SET NULL,
    delivery_date DATE NOT NULL,
    delivered_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
    received_by UUID REFERENCES employees(id),
    delivery_notes TEXT,
    grn_number TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for the new tables
CREATE INDEX IF NOT EXISTS idx_batch_assignments_batch_id ON batch_assignments(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_assignments_tailor_id ON batch_assignments(tailor_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_date ON calendar_events(start_date);
CREATE INDEX IF NOT EXISTS idx_page_items_page_path ON page_items(page_path);
CREATE INDEX IF NOT EXISTS idx_user_page_permissions_user_id ON user_page_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_po_attachments_po_id ON purchase_order_attachments(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_deliveries_po_id ON purchase_order_deliveries(purchase_order_id);

-- Enable RLS
ALTER TABLE batch_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_page_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_deliveries ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow authenticated users)
CREATE POLICY "Users can view batch assignments" ON batch_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage batch assignments" ON batch_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Users can view calendar events" ON calendar_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage calendar events" ON calendar_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Users can view page items" ON page_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage page items" ON page_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Users can view user page permissions" ON user_page_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage user page permissions" ON user_page_permissions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Users can view PO attachments" ON purchase_order_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage PO attachments" ON purchase_order_attachments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Users can view PO deliveries" ON purchase_order_deliveries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage PO deliveries" ON purchase_order_deliveries FOR ALL TO authenticated USING (true) WITH CHECK (true);

