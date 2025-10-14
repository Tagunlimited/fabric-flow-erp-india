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
        CREATE INDEX IF NOT EXISTS idx_floors_warehouse_id ON floors(warehouse_id);
    END IF;
    
    -- racks indexes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'racks') THEN
        CREATE INDEX IF NOT EXISTS idx_racks_floor_id ON racks(floor_id);
    END IF;
    
    -- bins indexes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bins') THEN
        CREATE INDEX IF NOT EXISTS idx_bins_rack_id ON bins(rack_id);
        
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
        CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_warehouse ON warehouse_inventory(warehouse_id);
        CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_item ON warehouse_inventory(item_id);
        CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_fabric ON warehouse_inventory(fabric_id);
    END IF;
    
    -- inventory_movements indexes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_movements') THEN
        CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements(movement_type);
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
        CREATE INDEX IF NOT EXISTS idx_grn_items_grn_id ON grn_items(grn_id);
        CREATE INDEX IF NOT EXISTS idx_grn_items_po_item_id ON grn_items(po_item_id);
    END IF;
    
    -- Tailor indexes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'batches') THEN
        CREATE INDEX IF NOT EXISTS idx_batches_code ON batches(batch_code);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tailors') THEN
        CREATE INDEX IF NOT EXISTS idx_tailors_code ON tailors(tailor_code);
        CREATE INDEX IF NOT EXISTS idx_tailors_batch_id ON tailors(batch_id);
        CREATE INDEX IF NOT EXISTS idx_tailors_status ON tailors(status);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tailor_assignments') THEN
        CREATE INDEX IF NOT EXISTS idx_tailor_assignments_tailor ON tailor_assignments(tailor_id);
        CREATE INDEX IF NOT EXISTS idx_tailor_assignments_order ON tailor_assignments(order_id);
    END IF;
    
    -- Order batch indexes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_batch_assignments') THEN
        CREATE INDEX IF NOT EXISTS idx_order_batch_assignments_order ON order_batch_assignments(order_id);
        CREATE INDEX IF NOT EXISTS idx_order_batch_assignments_batch ON order_batch_assignments(batch_id);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_batch_size_distributions') THEN
        CREATE INDEX IF NOT EXISTS idx_order_batch_size_dist_assignment ON order_batch_size_distributions(order_batch_assignment_id);
    END IF;
    
    -- Dispatch indexes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dispatch_order_items') THEN
        CREATE INDEX IF NOT EXISTS idx_dispatch_order_items_dispatch ON dispatch_order_items(dispatch_order_id);
        CREATE INDEX IF NOT EXISTS idx_dispatch_order_items_order ON dispatch_order_items(order_id);
    END IF;
    
    -- Fabric indexes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fabric_master') THEN
        CREATE INDEX IF NOT EXISTS idx_fabric_master_code ON fabric_master(fabric_code);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fabric_inventory') THEN
        CREATE INDEX IF NOT EXISTS idx_fabric_inventory_fabric ON fabric_inventory(fabric_id);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fabric_picking_records') THEN
        CREATE INDEX IF NOT EXISTS idx_fabric_picking_order ON fabric_picking_records(order_id);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fabric_usage_records') THEN
        CREATE INDEX IF NOT EXISTS idx_fabric_usage_order ON fabric_usage_records(order_id);
    END IF;
    
    -- Other indexes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'designations') THEN
        CREATE INDEX IF NOT EXISTS idx_designations_name ON designations(designation_name);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_types') THEN
        CREATE INDEX IF NOT EXISTS idx_customer_types_name ON customer_types(type_name);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_assets') THEN
        CREATE INDEX IF NOT EXISTS idx_company_assets_code ON company_assets(asset_code);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_activities') THEN
        CREATE INDEX IF NOT EXISTS idx_order_activities_order ON order_activities(order_id);
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

