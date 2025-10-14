-- ============================================================================
-- PRE-MIGRATION: Add Core Foundational Tables
-- Created: October 8, 2025
-- Description: Creates core tables that other tables depend on
-- ============================================================================

-- ============================================================================
-- 1. EMPLOYEES TABLE (referenced by many tables)
-- ============================================================================
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address_line1 TEXT NOT NULL,
    avatar_url TEXT,
    blood_group TEXT,
    city TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    date_of_birth DATE NOT NULL,
    department TEXT NOT NULL,
    department_id UUID,
    designation TEXT NOT NULL,
    emergency_contact_name TEXT NOT NULL,
    emergency_contact_phone TEXT NOT NULL,
    employee_code TEXT UNIQUE NOT NULL,
    employment_type TEXT NOT NULL,
    full_name TEXT NOT NULL,
    gender TEXT NOT NULL,
    joining_date DATE NOT NULL,
    marital_status TEXT,
    personal_email TEXT,
    personal_phone TEXT NOT NULL,
    pincode TEXT NOT NULL,
    reports_to UUID,
    state TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. DEPARTMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    description TEXT,
    head_id UUID,
    name TEXT NOT NULL
);

-- ============================================================================
-- 3. ITEM_MASTER TABLE (referenced by warehouse_inventory)
-- ============================================================================
CREATE TABLE IF NOT EXISTS item_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand TEXT,
    color TEXT,
    cost_price DECIMAL(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    current_stock DECIMAL(10,2),
    description TEXT,
    gst_rate DECIMAL(5,2),
    image TEXT,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    item_code TEXT UNIQUE NOT NULL,
    item_name TEXT NOT NULL,
    item_type TEXT NOT NULL,
    lead_time INTEGER,
    material TEXT,
    min_stock_level DECIMAL(10,2),
    size TEXT,
    uom TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    weight DECIMAL(10,2)
);

-- ============================================================================
-- 4. Add foreign keys after tables exist
-- ============================================================================

-- Add foreign keys to employees
ALTER TABLE employees 
DROP CONSTRAINT IF EXISTS employees_department_id_fkey,
DROP CONSTRAINT IF EXISTS employees_reports_to_fkey;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'employees_department_id_fkey'
    ) THEN
        ALTER TABLE employees 
        ADD CONSTRAINT employees_department_id_fkey 
        FOREIGN KEY (department_id) REFERENCES departments(id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'employees_reports_to_fkey'
    ) THEN
        ALTER TABLE employees 
        ADD CONSTRAINT employees_reports_to_fkey 
        FOREIGN KEY (reports_to) REFERENCES employees(id);
    END IF;
END $$;

-- Add foreign key to departments
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'departments_head_id_fkey'
    ) THEN
        ALTER TABLE departments 
        ADD CONSTRAINT departments_head_id_fkey 
        FOREIGN KEY (head_id) REFERENCES employees(id);
    END IF;
END $$;

-- ============================================================================
-- 5. Enable RLS
-- ============================================================================
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_master ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. Create RLS Policies
-- ============================================================================
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON employees;
CREATE POLICY "Allow all operations for authenticated users" ON employees 
FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON departments;
CREATE POLICY "Allow all operations for authenticated users" ON departments 
FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON item_master;
CREATE POLICY "Allow all operations for authenticated users" ON item_master 
FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- 7. Create Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_employees_code ON employees(employee_code);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_reports_to ON employees(reports_to);
CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name);
CREATE INDEX IF NOT EXISTS idx_departments_head ON departments(head_id);
CREATE INDEX IF NOT EXISTS idx_item_master_code ON item_master(item_code);
CREATE INDEX IF NOT EXISTS idx_item_master_name ON item_master(item_name);

-- ============================================================================
-- 8. Create Triggers
-- ============================================================================
DROP TRIGGER IF EXISTS update_employees_updated_at ON employees;
CREATE TRIGGER update_employees_updated_at
    BEFORE UPDATE ON employees
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_item_master_updated_at ON item_master;
CREATE TRIGGER update_item_master_updated_at
    BEFORE UPDATE ON item_master
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 9. DISPATCH_ORDERS TABLE (referenced by dispatch_order_items)
-- ============================================================================
CREATE TABLE IF NOT EXISTS dispatch_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actual_delivery DATE,
    courier_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    delivery_address TEXT NOT NULL,
    dispatch_date DATE DEFAULT CURRENT_DATE,
    dispatch_number TEXT UNIQUE NOT NULL,
    estimated_delivery DATE,
    order_id UUID NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'packed', 'shipped', 'delivered')),
    tracking_number TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 10. ORDERS TABLE (referenced by dispatch_orders)
-- ============================================================================
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advance_amount DECIMAL(12,2),
    balance_amount DECIMAL(12,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    customer_id UUID NOT NULL,
    delivery_date DATE,
    expected_delivery_date DATE,
    final_amount DECIMAL(12,2) DEFAULT 0,
    gst_amount DECIMAL(12,2),
    gst_rate DECIMAL(5,2),
    mockup_url TEXT,
    notes TEXT,
    order_date DATE DEFAULT CURRENT_DATE,
    order_number TEXT UNIQUE NOT NULL,
    payment_channel TEXT,
    reference_id TEXT,
    sales_manager TEXT,
    status TEXT DEFAULT 'pending',
    tax_amount DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 11. CUSTOMERS TABLE (referenced by orders)
-- ============================================================================
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address TEXT,
    city TEXT,
    company_name TEXT NOT NULL,
    contact_person TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    credit_limit DECIMAL(12,2),
    customer_tier TEXT,
    customer_type TEXT,
    email TEXT,
    gstin TEXT,
    last_order_date DATE,
    outstanding_amount DECIMAL(12,2),
    pan TEXT,
    pending_amount DECIMAL(12,2) DEFAULT 0,
    phone TEXT,
    pincode TEXT,
    state TEXT,
    total_orders INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign keys after all tables exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_customer_id_fkey'
    ) THEN
        ALTER TABLE orders 
        ADD CONSTRAINT orders_customer_id_fkey 
        FOREIGN KEY (customer_id) REFERENCES customers(id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'dispatch_orders_order_id_fkey'
    ) THEN
        ALTER TABLE dispatch_orders 
        ADD CONSTRAINT dispatch_orders_order_id_fkey 
        FOREIGN KEY (order_id) REFERENCES orders(id);
    END IF;
END $$;

-- Enable RLS
ALTER TABLE dispatch_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON dispatch_orders;
CREATE POLICY "Allow all operations for authenticated users" ON dispatch_orders 
FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON orders;
CREATE POLICY "Allow all operations for authenticated users" ON orders 
FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON customers;
CREATE POLICY "Allow all operations for authenticated users" ON customers 
FOR ALL USING (auth.role() = 'authenticated');

-- Create Indexes
CREATE INDEX IF NOT EXISTS idx_dispatch_orders_order ON dispatch_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_orders_number ON dispatch_orders(dispatch_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(company_name);

-- Create Triggers
DROP TRIGGER IF EXISTS update_dispatch_orders_updated_at ON dispatch_orders;
CREATE TRIGGER update_dispatch_orders_updated_at
    BEFORE UPDATE ON dispatch_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Success message
SELECT 'Core tables created successfully!' as status;

