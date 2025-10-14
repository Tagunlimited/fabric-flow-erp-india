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
