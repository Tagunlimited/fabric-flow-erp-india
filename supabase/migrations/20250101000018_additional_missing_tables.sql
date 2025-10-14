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
