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
