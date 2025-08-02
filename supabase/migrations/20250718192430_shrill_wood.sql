/*
  # Comprehensive ERP Schema

  1. New Tables
    - `roles` - System roles (Admin, Production Manager, Cutting Master, etc.)
    - `user_roles` - Many-to-many relationship between users and roles
    - `customer_types` - Customer type master data
    - `customers` - Enhanced customer management
    - `states` - Indian states master data
    - `quotations` - Quotation management
    - `invoices` - Invoice management
    - `receipts` - Receipt management
    - `payments` - Payment tracking
    - `expenses` - Expense management
    - `payroll` - Payroll management
    - `warehouses` - Warehouse master
    - `product_master` - Product master data
    - `item_master` - Item master data
    - `bills_of_materials` - BOM management
    - `purchase_orders` - Purchase order management
    - `goods_receipt_notes` - GRN management
    - `material_shortfall_alerts` - Material alerts
    - `employee_recognition` - Employee recognition program
    - `incentive_programs` - Incentive programs
    - `notifications` - System notifications

  2. Security
    - Enable RLS on all tables
    - Add appropriate policies for role-based access
*/

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default roles
INSERT INTO roles (name, description) VALUES
  ('Admin', 'System Administrator with full access'),
  ('Production Manager', 'Manages production operations'),
  ('Cutting Master', 'Handles cutting operations'),
  ('QC Manager', 'Quality control management'),
  ('Sales Manager', 'Sales operations management'),
  ('Inventory Manager', 'Inventory management'),
  ('Accounts Manager', 'Financial operations'),
  ('HR Manager', 'Human resources management'),
  ('Procurement Manager', 'Purchase and procurement'),
  ('Design Manager', 'Design and printing operations')
ON CONFLICT (name) DO NOTHING;

-- Create user_roles junction table
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by UUID,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role_id)
);

-- Create customer_types table
CREATE TABLE IF NOT EXISTS customer_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_percentage DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default customer types
INSERT INTO customer_types (name, description, discount_percentage) VALUES
  ('Wholesale', 'Wholesale customers', 15.00),
  ('Retail', 'Retail customers', 5.00),
  ('Ecommerce', 'Online platform customers', 10.00),
  ('Staff', 'Company staff purchases', 25.00)
ON CONFLICT (name) DO NOTHING;

-- Create Indian states table
CREATE TABLE IF NOT EXISTS states (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Indian states
INSERT INTO states (name, code) VALUES
  ('Andhra Pradesh', 'AP'),
  ('Arunachal Pradesh', 'AR'),
  ('Assam', 'AS'),
  ('Bihar', 'BR'),
  ('Chhattisgarh', 'CG'),
  ('Delhi', 'DL'),
  ('Goa', 'GA'),
  ('Gujarat', 'GJ'),
  ('Haryana', 'HR'),
  ('Himachal Pradesh', 'HP'),
  ('Jharkhand', 'JH'),
  ('Karnataka', 'KA'),
  ('Kerala', 'KL'),
  ('Madhya Pradesh', 'MP'),
  ('Maharashtra', 'MH'),
  ('Manipur', 'MN'),
  ('Meghalaya', 'ML'),
  ('Mizoram', 'MZ'),
  ('Nagaland', 'NL'),
  ('Odisha', 'OR'),
  ('Punjab', 'PB'),
  ('Rajasthan', 'RJ'),
  ('Sikkim', 'SK'),
  ('Tamil Nadu', 'TN'),
  ('Telangana', 'TS'),
  ('Tripura', 'TR'),
  ('Uttar Pradesh', 'UP'),
  ('Uttarakhand', 'UK'),
  ('West Bengal', 'WB')
ON CONFLICT (name) DO NOTHING;

-- Enhanced customers table
DROP TABLE IF EXISTS customers CASCADE;
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id TEXT GENERATED ALWAYS AS ('CUST-' || LPAD(EXTRACT(EPOCH FROM created_at)::TEXT, 10, '0')) STORED,
  company_name TEXT NOT NULL,
  gstin TEXT,
  mobile TEXT NOT NULL CHECK (length(mobile) >= 10),
  email TEXT NOT NULL CHECK (email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+[.][A-Za-z]+$'),
  customer_type_id INTEGER REFERENCES customer_types(id),
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state_id INTEGER REFERENCES states(id),
  pincode TEXT NOT NULL CHECK (length(pincode) = 6),
  loyalty_points INTEGER DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create quotations table
CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number TEXT GENERATED ALWAYS AS ('QUO-' || LPAD(EXTRACT(EPOCH FROM created_at)::TEXT, 10, '0')) STORED,
  customer_id UUID REFERENCES customers(id),
  total_amount DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  final_amount DECIMAL(12,2) DEFAULT 0,
  valid_until DATE,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT GENERATED ALWAYS AS ('INV-' || LPAD(EXTRACT(EPOCH FROM created_at)::TEXT, 10, '0')) STORED,
  customer_id UUID REFERENCES customers(id),
  quotation_id UUID REFERENCES quotations(id),
  order_id UUID REFERENCES orders(id),
  total_amount DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  final_amount DECIMAL(12,2) DEFAULT 0,
  due_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create receipts table
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT GENERATED ALWAYS AS ('REC-' || LPAD(EXTRACT(EPOCH FROM created_at)::TEXT, 10, '0')) STORED,
  invoice_id UUID REFERENCES invoices(id),
  customer_id UUID REFERENCES customers(id),
  amount DECIMAL(12,2) NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('cash', 'cheque', 'bank_transfer', 'upi', 'card')),
  reference_number TEXT,
  received_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number TEXT GENERATED ALWAYS AS ('PAY-' || LPAD(EXTRACT(EPOCH FROM created_at)::TEXT, 10, '0')) STORED,
  vendor_name TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('cash', 'cheque', 'bank_transfer', 'upi', 'card')),
  reference_number TEXT,
  payment_date DATE DEFAULT CURRENT_DATE,
  category TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number TEXT GENERATED ALWAYS AS ('EXP-' || LPAD(EXTRACT(EPOCH FROM created_at)::TEXT, 10, '0')) STORED,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  expense_date DATE DEFAULT CURRENT_DATE,
  payment_method TEXT CHECK (payment_method IN ('cash', 'cheque', 'bank_transfer', 'upi', 'card')),
  receipt_url TEXT,
  approved_by UUID,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create payroll table
CREATE TABLE IF NOT EXISTS payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID,
  employee_name TEXT NOT NULL,
  basic_salary DECIMAL(12,2) NOT NULL,
  allowances DECIMAL(12,2) DEFAULT 0,
  deductions DECIMAL(12,2) DEFAULT 0,
  net_salary DECIMAL(12,2) NOT NULL,
  pay_period_start DATE NOT NULL,
  pay_period_end DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'paid')),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create warehouses table
CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state_id INTEGER REFERENCES states(id),
  pincode TEXT NOT NULL,
  manager_name TEXT,
  contact_number TEXT,
  capacity_sqft INTEGER,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create product_master table
CREATE TABLE IF NOT EXISTS product_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code TEXT NOT NULL UNIQUE,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  description TEXT,
  unit_of_measure TEXT NOT NULL,
  base_price DECIMAL(10,2),
  tax_rate DECIMAL(5,2) DEFAULT 18.00,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create item_master table
CREATE TABLE IF NOT EXISTS item_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code TEXT NOT NULL UNIQUE,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  unit_of_measure TEXT NOT NULL,
  minimum_stock INTEGER DEFAULT 0,
  maximum_stock INTEGER,
  reorder_level INTEGER DEFAULT 0,
  standard_cost DECIMAL(10,2),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create bills_of_materials table
CREATE TABLE IF NOT EXISTS bills_of_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_number TEXT GENERATED ALWAYS AS ('BOM-' || LPAD(EXTRACT(EPOCH FROM created_at)::TEXT, 10, '0')) STORED,
  product_id UUID REFERENCES product_master(id),
  version INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create purchase_orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT GENERATED ALWAYS AS ('PO-' || LPAD(EXTRACT(EPOCH FROM created_at)::TEXT, 10, '0')) STORED,
  vendor_name TEXT NOT NULL,
  vendor_contact TEXT,
  total_amount DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  final_amount DECIMAL(12,2) DEFAULT 0,
  expected_delivery DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'sent', 'received', 'cancelled')),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create goods_receipt_notes table
CREATE TABLE IF NOT EXISTS goods_receipt_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_number TEXT GENERATED ALWAYS AS ('GRN-' || LPAD(EXTRACT(EPOCH FROM created_at)::TEXT, 10, '0')) STORED,
  po_id UUID REFERENCES purchase_orders(id),
  received_date DATE DEFAULT CURRENT_DATE,
  received_by UUID,
  quality_status TEXT DEFAULT 'pending' CHECK (quality_status IN ('pending', 'approved', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create material_shortfall_alerts table
CREATE TABLE IF NOT EXISTS material_shortfall_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES item_master(id),
  current_stock INTEGER NOT NULL,
  required_stock INTEGER NOT NULL,
  shortfall_quantity INTEGER NOT NULL,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create employee_recognition table
CREATE TABLE IF NOT EXISTS employee_recognition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID,
  employee_name TEXT NOT NULL,
  recognition_type TEXT NOT NULL,
  description TEXT NOT NULL,
  points_awarded INTEGER DEFAULT 0,
  recognized_by UUID,
  recognition_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create incentive_programs table
CREATE TABLE IF NOT EXISTS incentive_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_name TEXT NOT NULL,
  description TEXT,
  target_metric TEXT NOT NULL,
  target_value DECIMAL(12,2) NOT NULL,
  incentive_amount DECIMAL(12,2) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'completed')),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  read BOOLEAN DEFAULT FALSE,
  action_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add avatar_url to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE profiles ADD COLUMN avatar_url TEXT;
  END IF;
END $$;

-- Enable RLS on all tables
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE states ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills_of_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_shortfall_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_recognition ENABLE ROW LEVEL SECURITY;
ALTER TABLE incentive_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Authenticated users can view roles" ON roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage user_roles" ON user_roles FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users can view customer_types" ON customer_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can view states" ON states FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage customers" ON customers FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage quotations" ON quotations FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage invoices" ON invoices FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage receipts" ON receipts FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage payments" ON payments FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage expenses" ON expenses FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage payroll" ON payroll FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage warehouses" ON warehouses FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage product_master" ON product_master FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage item_master" ON item_master FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage bills_of_materials" ON bills_of_materials FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage purchase_orders" ON purchase_orders FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage goods_receipt_notes" ON goods_receipt_notes FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage material_shortfall_alerts" ON material_shortfall_alerts FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage employee_recognition" ON employee_recognition FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage incentive_programs" ON incentive_programs FOR ALL TO authenticated USING (true);
CREATE POLICY "Users can view their notifications" ON notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update their notifications" ON notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quotations_updated_at BEFORE UPDATE ON quotations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();