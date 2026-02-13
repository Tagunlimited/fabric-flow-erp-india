-- ============================================================================
-- COMPLETE DATABASE MIGRATION - For Empty Database
-- Generated: October 8, 2025
-- Target: Scissors ERP Staging Database
-- Description: Creates complete schema from scratch (74 tables + 9 views)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- HELPER FUNCTIONS (Create First)
-- ============================================================================

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 1: CORE MASTER TABLES
-- ============================================================================

-- 1. Company Settings
CREATE TABLE company_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address TEXT DEFAULT '',
    bank_details JSONB DEFAULT '{}',
    city TEXT DEFAULT '',
    company_name TEXT DEFAULT 'Scissors ERP',
    contact_email TEXT DEFAULT '',
    contact_phone TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    favicon_url TEXT,
    gstin TEXT DEFAULT '',
    header_logo_url TEXT,
    logo_url TEXT DEFAULT '',
    pincode TEXT DEFAULT '',
    sidebar_logo_url TEXT,
    state TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Profiles
CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    department TEXT,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    role TEXT DEFAULT 'admin',
    status TEXT DEFAULT 'active',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID UNIQUE NOT NULL
);

-- 3. Roles
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    description TEXT,
    name TEXT NOT NULL
);

-- 4. User Roles
CREATE TABLE user_roles (
    user_id UUID NOT NULL,
    role_id UUID NOT NULL REFERENCES roles(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID,
    PRIMARY KEY (user_id, role_id)
);

-- ============================================================================
-- PART 2: CUSTOMER & SUPPLIER TABLES
-- ============================================================================

-- 5. Customers
CREATE TABLE customers (
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

-- 6. Customer Users
CREATE TABLE customer_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    customer_id UUID REFERENCES customers(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID
);

-- 7. Customer Portal Settings
CREATE TABLE customer_portal_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    can_download_documents BOOLEAN DEFAULT true,
    can_request_changes BOOLEAN DEFAULT true,
    can_view_invoices BOOLEAN DEFAULT true,
    can_view_orders BOOLEAN DEFAULT true,
    can_view_production_status BOOLEAN DEFAULT true,
    can_view_quotations BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    customer_id UUID REFERENCES customers(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Customer Activity Log
CREATE TABLE customer_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    customer_id UUID REFERENCES customers(id),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    user_id UUID
);

-- 9. Customer Types
CREATE TABLE customer_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_name TEXT NOT NULL UNIQUE,
    description TEXT,
    discount_percentage DECIMAL(5,2) DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Supplier Master
CREATE TABLE supplier_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_address TEXT,
    contact_person TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    credit_limit DECIMAL(12,2),
    email TEXT,
    enabled BOOLEAN DEFAULT true,
    gst_number TEXT,
    pan TEXT,
    phone TEXT,
    supplier_code TEXT UNIQUE NOT NULL,
    supplier_name TEXT NOT NULL,
    total_outstanding_amount DECIMAL(12,2),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Supplier Specializations
CREATE TABLE supplier_specializations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    priority INTEGER,
    specialization_id TEXT NOT NULL,
    specialization_name TEXT NOT NULL,
    specialization_type TEXT NOT NULL,
    supplier_id UUID NOT NULL REFERENCES supplier_master(id)
);

-- ============================================================================
-- PART 3: ORGANIZATION TABLES
-- ============================================================================

-- 12. Departments
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    description TEXT,
    head_id UUID,
    name TEXT NOT NULL
);

-- 13. Employees
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address_line1 TEXT NOT NULL,
    avatar_url TEXT,
    blood_group TEXT,
    city TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    date_of_birth DATE NOT NULL,
    department TEXT NOT NULL,
    department_id UUID REFERENCES departments(id),
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
    reports_to UUID REFERENCES employees(id),
    state TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Designations
CREATE TABLE designations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    designation_name TEXT NOT NULL UNIQUE,
    description TEXT,
    department TEXT,
    level INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. Designation Departments
CREATE TABLE designation_departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    designation_id UUID REFERENCES designations(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(designation_id, department_id)
);

-- Update departments foreign key
ALTER TABLE departments ADD CONSTRAINT departments_head_id_fkey 
    FOREIGN KEY (head_id) REFERENCES employees(id);

-- ============================================================================
-- PART 4: PRODUCT & INVENTORY TABLES
-- ============================================================================

-- 16. Product Categories
CREATE TABLE product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_image_url TEXT,
    category_images JSONB,
    category_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    description TEXT,
    fabrics TEXT[],
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. Products
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_price DECIMAL(10,2) NOT NULL,
    category TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    cost_price DECIMAL(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    description TEXT,
    hsn_code TEXT,
    name TEXT NOT NULL,
    tax_rate DECIMAL(5,2),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. Product Master
CREATE TABLE product_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand TEXT,
    category TEXT,
    class TEXT,
    color TEXT,
    cost_price DECIMAL(10,2),
    description TEXT,
    fabric TEXT,
    gender TEXT,
    gsm DECIMAL(8,2),
    gst_rate DECIMAL(5,2),
    hsn TEXT,
    image_url TEXT,
    images TEXT[],
    maximum_stock INTEGER,
    min_stock INTEGER,
    mrp DECIMAL(10,2),
    name TEXT,
    selling_price DECIMAL(10,2),
    size TEXT,
    size_type TEXT,
    sku TEXT,
    sku_hierarchy INTEGER,
    style TEXT
);

-- 19. Size Types
CREATE TABLE size_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    available_sizes TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    size_name TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 20. Item Master
CREATE TABLE item_master (
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

-- 21. Item Images
CREATE TABLE item_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES item_master(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    image_type TEXT DEFAULT 'main',
    is_primary BOOLEAN DEFAULT false,
    description TEXT,
    uploaded_by UUID,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 22. Inventory
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    current_stock DECIMAL(10,2) DEFAULT 0,
    item_code TEXT NOT NULL,
    item_name TEXT NOT NULL,
    last_purchase_date DATE,
    maximum_stock DECIMAL(10,2),
    minimum_stock DECIMAL(10,2) DEFAULT 0,
    rate_per_unit DECIMAL(10,2) NOT NULL,
    supplier_contact TEXT,
    supplier_name TEXT,
    unit TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 23. Company Assets
CREATE TABLE company_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_code TEXT UNIQUE NOT NULL,
    asset_name TEXT NOT NULL,
    asset_type TEXT,
    category TEXT,
    description TEXT,
    purchase_date DATE,
    purchase_price DECIMAL(12,2),
    current_value DECIMAL(12,2),
    location TEXT,
    assigned_to UUID REFERENCES employees(id),
    status TEXT DEFAULT 'active',
    warranty_expiry DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 5: FABRIC TABLES
-- ============================================================================

-- 24. Fabrics
CREATE TABLE fabrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES product_categories(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    description TEXT,
    image_url TEXT,
    name TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 25. Fabric Variants
CREATE TABLE fabric_variants (
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

-- 26. Fabric Master (Legacy)
CREATE TABLE fabric_master (
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

-- ============================================================================
-- PART 6: ORDER TABLES
-- ============================================================================

-- 27. Orders
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advance_amount DECIMAL(12,2),
    balance_amount DECIMAL(12,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    customer_id UUID NOT NULL REFERENCES customers(id),
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

-- 28. Order Items
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attachments TEXT[],
    category_image_url TEXT,
    color TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    fabric_id UUID REFERENCES fabrics(id),
    gsm TEXT,
    mockup_images TEXT[],
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_category_id UUID REFERENCES product_categories(id),
    product_description TEXT,
    product_id UUID REFERENCES products(id),
    quantity INTEGER NOT NULL,
    reference_images TEXT[],
    remarks TEXT,
    size_type_id UUID REFERENCES size_types(id),
    sizes_quantities JSONB,
    specifications JSONB,
    total_price DECIMAL(12,2) NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL
);

-- 29. Order Assignments
CREATE TABLE order_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    cutting_master_id UUID REFERENCES employees(id),
    cutting_master_name TEXT,
    cutting_work_date DATE,
    pattern_master_id UUID REFERENCES employees(id),
    pattern_master_name TEXT,
    pattern_work_date DATE,
    cut_quantity INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(order_id)
);

-- 30. Order Images
CREATE TABLE order_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    image_type TEXT DEFAULT 'reference',
    description TEXT,
    uploaded_by UUID,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 31. Order Activities
CREATE TABLE order_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL,
    activity_description TEXT,
    performed_by UUID,
    performed_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 32. Calendar Events
CREATE TABLE calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assigned_by UUID,
    assigned_to UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    date DATE NOT NULL,
    deadline DATE,
    department TEXT,
    details TEXT,
    priority TEXT,
    status TEXT,
    time TEXT,
    title TEXT NOT NULL,
    type TEXT NOT NULL
);

-- ============================================================================
-- PART 7: PRODUCTION TABLES
-- ============================================================================

-- 33. Production Team
CREATE TABLE production_team (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address_line1 TEXT NOT NULL,
    avatar_url TEXT,
    batch_leader_id UUID,
    city TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    date_of_birth DATE NOT NULL,
    designation TEXT NOT NULL,
    employee_code TEXT UNIQUE NOT NULL,
    employment_type TEXT,
    full_name TEXT NOT NULL,
    gender TEXT NOT NULL,
    is_batch_leader BOOLEAN DEFAULT false,
    joining_date DATE NOT NULL,
    per_piece_rate DECIMAL(10,2),
    personal_email TEXT,
    personal_phone TEXT NOT NULL,
    pincode TEXT NOT NULL,
    state TEXT NOT NULL,
    tailor_type TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE production_team ADD CONSTRAINT fk_production_team_batch_leader 
    FOREIGN KEY (batch_leader_id) REFERENCES production_team(id);

-- 34. Production Orders
CREATE TABLE production_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actual_hours DECIMAL(8,2),
    assigned_to UUID REFERENCES production_team(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    efficiency_percentage DECIMAL(5,2),
    end_date DATE,
    estimated_hours DECIMAL(8,2),
    notes TEXT,
    order_id UUID NOT NULL REFERENCES orders(id),
    production_number TEXT UNIQUE NOT NULL,
    stage TEXT DEFAULT 'cutting',
    start_date DATE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 35. Quality Checks
CREATE TABLE quality_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_date DATE DEFAULT CURRENT_DATE,
    checked_by UUID REFERENCES employees(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    defects_found TEXT[],
    notes TEXT,
    order_id UUID NOT NULL REFERENCES orders(id),
    pass_percentage DECIMAL(5,2),
    production_order_id UUID REFERENCES production_orders(id),
    rework_required BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'pending',
    order_batch_assignment_id UUID
);

-- ============================================================================
-- PART 8: TAILOR & BATCH MANAGEMENT
-- ============================================================================

-- 36. Batches
CREATE TABLE batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_name TEXT NOT NULL UNIQUE,
    batch_code TEXT UNIQUE NOT NULL,
    batch_leader_id UUID,
    batch_leader_name TEXT,
    batch_leader_avatar TEXT,
    max_capacity INTEGER DEFAULT 10,
    current_capacity INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 37. Tailors
CREATE TABLE tailors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tailor_code TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    skill_level TEXT DEFAULT 'beginner',
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    is_batch_leader BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'active',
    date_of_birth DATE,
    gender TEXT,
    personal_phone TEXT,
    personal_email TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    country TEXT DEFAULT 'India',
    joining_date DATE DEFAULT CURRENT_DATE,
    employment_type TEXT DEFAULT 'Full-time',
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

ALTER TABLE batches ADD CONSTRAINT batches_batch_leader_id_fkey 
    FOREIGN KEY (batch_leader_id) REFERENCES tailors(id) ON DELETE SET NULL;

-- 38. Tailor Assignments
CREATE TABLE tailor_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tailor_id UUID REFERENCES tailors(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'assigned',
    priority TEXT DEFAULT 'medium',
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    quality_rating DECIMAL(3,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 39. Tailor Skills
CREATE TABLE tailor_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tailor_id UUID REFERENCES tailors(id) ON DELETE CASCADE,
    skill_name TEXT NOT NULL,
    proficiency_level TEXT NOT NULL,
    years_of_experience DECIMAL(3,1) DEFAULT 0.0,
    certified BOOLEAN DEFAULT false,
    certification_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tailor_id, skill_name)
);

-- 40. Tailor Attendance
CREATE TABLE tailor_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tailor_id UUID REFERENCES tailors(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    hours_worked DECIMAL(4,2) DEFAULT 0.0,
    status TEXT DEFAULT 'present',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tailor_id, attendance_date)
);

-- 41. Order Batch Assignments
CREATE TABLE order_batch_assignments (
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
    status TEXT DEFAULT 'assigned',
    priority TEXT DEFAULT 'medium',
    total_quantity INTEGER DEFAULT 0,
    completed_quantity INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 42. Order Batch Size Distributions
CREATE TABLE order_batch_size_distributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_batch_assignment_id UUID NOT NULL REFERENCES order_batch_assignments(id) ON DELETE CASCADE,
    size_name TEXT NOT NULL,
    assigned_quantity INTEGER NOT NULL DEFAULT 0,
    picked_quantity INTEGER DEFAULT 0,
    completed_quantity INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE quality_checks ADD CONSTRAINT quality_checks_order_batch_assignment_id_fkey 
    FOREIGN KEY (order_batch_assignment_id) REFERENCES order_batch_assignments(id);

-- ============================================================================
-- PART 9: PROCUREMENT TABLES
-- ============================================================================

-- 43. Purchase Orders
CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approved_at TIMESTAMPTZ,
    approved_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    delivery_address TEXT,
    expected_delivery_date DATE,
    gst_total DECIMAL(15,2) DEFAULT 0,
    notes TEXT,
    order_date DATE DEFAULT CURRENT_DATE,
    po_number TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'draft',
    subtotal DECIMAL(15,2) DEFAULT 0,
    supplier_id UUID NOT NULL REFERENCES supplier_master(id),
    terms_conditions TEXT,
    total_amount DECIMAL(15,2) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 44. Purchase Order Items
CREATE TABLE purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    gst_amount DECIMAL(15,2) DEFAULT 0,
    gst_rate DECIMAL(5,2) DEFAULT 0,
    item_id UUID,
    item_image_url TEXT,
    item_name TEXT NOT NULL,
    item_type TEXT NOT NULL,
    line_total DECIMAL(15,2) DEFAULT 0,
    notes TEXT,
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    quantity DECIMAL(10,2) DEFAULT 0,
    total_price DECIMAL(15,2) DEFAULT 0,
    unit_of_measure TEXT DEFAULT 'pcs',
    unit_price DECIMAL(10,2) DEFAULT 0
);

-- 45. Purchase Order Attachments
CREATE TABLE purchase_order_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name TEXT NOT NULL,
    file_size INTEGER,
    file_type TEXT NOT NULL,
    file_url TEXT NOT NULL,
    po_id UUID NOT NULL REFERENCES purchase_orders(id),
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    uploaded_by UUID
);

-- 46. Purchase Order Deliveries
CREATE TABLE purchase_order_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_quantity DECIMAL(10,2) DEFAULT 0,
    delivery_date DATE DEFAULT CURRENT_DATE,
    delivery_number TEXT UNIQUE NOT NULL,
    inspection_notes TEXT,
    po_id UUID NOT NULL REFERENCES purchase_orders(id),
    po_item_id UUID NOT NULL REFERENCES purchase_order_items(id),
    quality_status TEXT DEFAULT 'pending',
    received_at TIMESTAMPTZ,
    received_by UUID
);

-- 47. Purchase Order Fabric Details
CREATE TABLE purchase_order_fabric_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    fabric_id UUID NOT NULL REFERENCES fabrics(id),
    quantity DECIMAL(10,2) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    received_quantity DECIMAL(10,2) DEFAULT 0,
    quality_status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 10: GRN (GOODS RECEIPT NOTE) TABLES
-- ============================================================================

-- 48. GRN Master
CREATE TABLE grn_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_number TEXT UNIQUE NOT NULL,
    po_id UUID NOT NULL REFERENCES purchase_orders(id),
    supplier_id UUID NOT NULL REFERENCES supplier_master(id),
    grn_date DATE NOT NULL DEFAULT CURRENT_DATE,
    received_date TIMESTAMPTZ DEFAULT NOW(),
    received_by UUID,
    received_at_location TEXT,
    status TEXT DEFAULT 'draft',
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

-- 49. GRN Items
CREATE TABLE grn_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id UUID NOT NULL REFERENCES grn_master(id) ON DELETE CASCADE,
    po_item_id UUID NOT NULL REFERENCES purchase_order_items(id),
    item_type TEXT NOT NULL,
    item_id UUID NOT NULL,
    item_name TEXT NOT NULL,
    item_image_url TEXT,
    ordered_quantity DECIMAL(10,2) NOT NULL,
    received_quantity DECIMAL(10,2) NOT NULL,
    approved_quantity DECIMAL(10,2) DEFAULT 0,
    rejected_quantity DECIMAL(10,2) DEFAULT 0,
    unit_of_measure TEXT DEFAULT 'pcs',
    unit_price DECIMAL(15,2) NOT NULL,
    total_price DECIMAL(15,2) NOT NULL,
    gst_rate DECIMAL(5,2) DEFAULT 0,
    gst_amount DECIMAL(15,2) DEFAULT 0,
    line_total DECIMAL(15,2) NOT NULL,
    quality_status TEXT DEFAULT 'pending',
    batch_number TEXT,
    expiry_date DATE,
    condition_notes TEXT,
    inspection_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 50. GRN Quality Inspections
CREATE TABLE grn_quality_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_item_id UUID NOT NULL REFERENCES grn_items(id) ON DELETE CASCADE,
    inspection_type TEXT NOT NULL,
    inspection_criteria TEXT,
    expected_result TEXT,
    actual_result TEXT,
    inspection_status TEXT DEFAULT 'pending',
    inspector_id UUID,
    inspection_date TIMESTAMPTZ DEFAULT NOW(),
    inspection_notes TEXT,
    photos_urls TEXT[],
    test_certificates_urls TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 51. GRN Discrepancies
CREATE TABLE grn_discrepancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id UUID NOT NULL REFERENCES grn_master(id) ON DELETE CASCADE,
    grn_item_id UUID REFERENCES grn_items(id) ON DELETE CASCADE,
    discrepancy_type TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',
    impact_on_payment BOOLEAN DEFAULT false,
    resolution_status TEXT DEFAULT 'open',
    resolution_notes TEXT,
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 52. GRN Attachments
CREATE TABLE grn_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id UUID NOT NULL REFERENCES grn_master(id) ON DELETE CASCADE,
    attachment_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    uploaded_by UUID,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 53. GRN Items Fabric Details
CREATE TABLE grn_items_fabric_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_item_id UUID NOT NULL REFERENCES grn_items(id) ON DELETE CASCADE,
    fabric_id UUID NOT NULL REFERENCES fabrics(id),
    received_quantity DECIMAL(10,2) NOT NULL,
    approved_quantity DECIMAL(10,2) DEFAULT 0,
    rejected_quantity DECIMAL(10,2) DEFAULT 0,
    quality_status TEXT DEFAULT 'pending',
    batch_number TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 11: BOM (BILL OF MATERIALS) TABLES
-- ============================================================================

-- 54. BOM Records
CREATE TABLE bom_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    order_id UUID REFERENCES orders(id),
    order_item_id UUID REFERENCES order_items(id),
    product_image_url TEXT,
    product_name TEXT,
    status TEXT DEFAULT 'draft',
    total_order_qty INTEGER DEFAULT 0
);

-- 55. BOM Record Items
CREATE TABLE bom_record_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bom_id UUID NOT NULL REFERENCES bom_records(id) ON DELETE CASCADE,
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    item_code TEXT,
    item_id UUID REFERENCES item_master(id),
    item_name TEXT,
    qty_per_product DECIMAL(10,2),
    qty_total DECIMAL(10,2),
    stock DECIMAL(10,2) DEFAULT 0,
    to_order DECIMAL(10,2) DEFAULT 0,
    unit_of_measure TEXT
);

-- ============================================================================
-- PART 12: ACCOUNTING TABLES
-- ============================================================================

-- 56. Quotations
CREATE TABLE quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    customer_id UUID REFERENCES customers(id),
    notes TEXT,
    quotation_date DATE DEFAULT CURRENT_DATE,
    quotation_number TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'draft',
    subtotal DECIMAL(12,2) DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    terms_and_conditions TEXT,
    total_amount DECIMAL(12,2) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    valid_until DATE
);

-- 57. Quotation Items
CREATE TABLE quotation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    description TEXT NOT NULL,
    product_id UUID REFERENCES products(id),
    quantity INTEGER NOT NULL,
    quotation_id UUID REFERENCES quotations(id),
    total_price DECIMAL(10,2) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL
);

-- 58. Invoices
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    balance_amount DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    customer_id UUID NOT NULL REFERENCES customers(id),
    due_date DATE NOT NULL,
    invoice_date DATE DEFAULT CURRENT_DATE,
    invoice_number TEXT UNIQUE NOT NULL,
    notes TEXT,
    order_id UUID REFERENCES orders(id),
    paid_amount DECIMAL(12,2) DEFAULT 0,
    status TEXT DEFAULT 'draft',
    subtotal DECIMAL(12,2) DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    terms_and_conditions TEXT,
    total_amount DECIMAL(12,2) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 59. Invoice Items
CREATE TABLE invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    description TEXT NOT NULL,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    quantity INTEGER NOT NULL,
    total_price DECIMAL(10,2),
    unit_price DECIMAL(10,2) NOT NULL
);

-- 60. Receipts
CREATE TABLE receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    amount DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    entry_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    payment_mode TEXT NOT NULL,
    payment_type TEXT NOT NULL,
    receipt_number TEXT UNIQUE NOT NULL,
    reference_id TEXT NOT NULL,
    reference_number TEXT,
    reference_txn_id TEXT,
    reference_type TEXT NOT NULL,
    verified_by UUID
);

-- 61. Receipts Items
CREATE TABLE receipts_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id),
    amount DECIMAL(12,2) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 13: DISPATCH TABLES
-- ============================================================================

-- 62. Dispatch Orders
CREATE TABLE dispatch_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actual_delivery DATE,
    courier_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    delivery_address TEXT NOT NULL,
    dispatch_date DATE DEFAULT CURRENT_DATE,
    dispatch_number TEXT UNIQUE NOT NULL,
    estimated_delivery DATE,
    order_id UUID NOT NULL REFERENCES orders(id),
    status TEXT DEFAULT 'pending',
    tracking_number TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 63. Dispatch Order Items
CREATE TABLE dispatch_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_order_id UUID NOT NULL REFERENCES dispatch_orders(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id),
    size_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 14: WAREHOUSE TABLES
-- ============================================================================

-- 64. Warehouses
CREATE TABLE warehouses (
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

-- 65. Floors
CREATE TABLE floors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    floor_number INTEGER NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(warehouse_id, floor_number)
);

-- 66. Racks
CREATE TABLE racks (
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

-- 67. Bins
CREATE TABLE bins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rack_id UUID NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
    bin_code TEXT NOT NULL,
    location_type TEXT NOT NULL DEFAULT 'RECEIVING_ZONE',
    max_capacity DECIMAL(10,2) DEFAULT 0,
    current_capacity DECIMAL(10,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    dimensions JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(rack_id, bin_code)
);

-- 68. Warehouse Inventory
CREATE TABLE warehouse_inventory (
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

-- 69. Warehouse Master (Legacy)
CREATE TABLE warehouse_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_code TEXT UNIQUE NOT NULL,
    warehouse_name TEXT NOT NULL,
    location TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    capacity DECIMAL(10,2),
    capacity_unit TEXT DEFAULT 'sqft',
    manager_id UUID REFERENCES employees(id),
    phone TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 70. Inventory Movements
CREATE TABLE inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movement_type TEXT NOT NULL,
    item_id UUID,
    fabric_id UUID REFERENCES fabrics(id),
    from_warehouse_id UUID REFERENCES warehouses(id),
    to_warehouse_id UUID REFERENCES warehouses(id),
    from_bin_id UUID REFERENCES bins(id),
    to_bin_id UUID REFERENCES bins(id),
    quantity DECIMAL(10,2) NOT NULL,
    unit TEXT,
    reference_type TEXT,
    reference_id UUID,
    notes TEXT,
    moved_by UUID,
    movement_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 71. Fabric Inventory
CREATE TABLE fabric_inventory (
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

-- 72. Fabric Storage Zones
CREATE TABLE fabric_storage_zones (
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

-- 73. Fabric Picking Records
CREATE TABLE fabric_picking_records (
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

-- 74. Fabric Usage Records
CREATE TABLE fabric_usage_records (
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
-- PART 15: INDEXES FOR PERFORMANCE
-- ============================================================================

-- Customer indexes
CREATE INDEX idx_customers_name ON customers(company_name);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customer_users_customer ON customer_users(customer_id);

-- Supplier indexes
CREATE INDEX idx_supplier_master_code ON supplier_master(supplier_code);
CREATE INDEX idx_supplier_master_name ON supplier_master(supplier_name);
CREATE INDEX idx_supplier_specializations_supplier ON supplier_specializations(supplier_id);

-- Employee indexes
CREATE INDEX idx_employees_code ON employees(employee_code);
CREATE INDEX idx_employees_department ON employees(department_id);
CREATE INDEX idx_departments_name ON departments(name);

-- Product indexes
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_code ON products(code);
CREATE INDEX idx_product_categories_name ON product_categories(category_name);
CREATE INDEX idx_item_master_code ON item_master(item_code);
CREATE INDEX idx_item_master_name ON item_master(item_name);

-- Fabric indexes
CREATE INDEX idx_fabrics_name ON fabrics(name);
CREATE INDEX idx_fabric_variants_fabric ON fabric_variants(fabric_id);
CREATE INDEX idx_fabric_master_code ON fabric_master(fabric_code);

-- Order indexes
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_date ON orders(order_date);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_assignments_order ON order_assignments(order_id);

-- Production indexes
CREATE INDEX idx_production_team_code ON production_team(employee_code);
CREATE INDEX idx_production_orders_order ON production_orders(order_id);
CREATE INDEX idx_quality_checks_order ON quality_checks(order_id);

-- Batch indexes
CREATE INDEX idx_batches_code ON batches(batch_code);
CREATE INDEX idx_tailors_code ON tailors(tailor_code);
CREATE INDEX idx_tailors_batch ON tailors(batch_id);
CREATE INDEX idx_order_batch_assignments_order ON order_batch_assignments(order_id);

-- Purchase Order indexes
CREATE INDEX idx_purchase_orders_number ON purchase_orders(po_number);
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_order_items_po ON purchase_order_items(po_id);

-- GRN indexes
CREATE INDEX idx_grn_master_number ON grn_master(grn_number);
CREATE INDEX idx_grn_master_po ON grn_master(po_id);
CREATE INDEX idx_grn_items_grn ON grn_items(grn_id);

-- BOM indexes
CREATE INDEX idx_bom_records_order ON bom_records(order_id);
CREATE INDEX idx_bom_record_items_bom ON bom_record_items(bom_id);

-- Accounting indexes
CREATE INDEX idx_quotations_number ON quotations(quotation_number);
CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_receipts_number ON receipts(receipt_number);
CREATE INDEX idx_receipts_customer ON receipts(customer_id);

-- Dispatch indexes
CREATE INDEX idx_dispatch_orders_number ON dispatch_orders(dispatch_number);
CREATE INDEX idx_dispatch_orders_order ON dispatch_orders(order_id);
CREATE INDEX idx_dispatch_order_items_dispatch ON dispatch_order_items(dispatch_order_id);

-- Warehouse indexes
CREATE INDEX idx_warehouses_code ON warehouses(code);
CREATE INDEX idx_floors_warehouse ON floors(warehouse_id);
CREATE INDEX idx_racks_floor ON racks(floor_id);
CREATE INDEX idx_bins_rack ON bins(rack_id);
CREATE INDEX idx_warehouse_inventory_warehouse ON warehouse_inventory(warehouse_id);
CREATE INDEX idx_warehouse_inventory_bin ON warehouse_inventory(bin_id);

-- ============================================================================
-- PART 16: ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_portal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_specializations ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE designation_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE size_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tailors ENABLE ROW LEVEL SECURITY;
ALTER TABLE tailor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tailor_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE tailor_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_batch_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_batch_size_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_fabric_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_quality_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_discrepancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_items_fabric_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_record_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE racks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bins ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_storage_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_picking_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_usage_records ENABLE ROW LEVEL SECURITY;

-- Create simple RLS policies (allow all for authenticated users)
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'company_settings', 'profiles', 'roles', 'user_roles',
        'customers', 'customer_users', 'customer_portal_settings', 'customer_activity_log', 'customer_types',
        'supplier_master', 'supplier_specializations',
        'departments', 'employees', 'designations', 'designation_departments',
        'product_categories', 'products', 'product_master', 'size_types', 'item_master', 'item_images', 'inventory', 'company_assets',
        'fabrics', 'fabric_variants', 'fabric_master',
        'orders', 'order_items', 'order_assignments', 'order_images', 'order_activities', 'calendar_events',
        'production_team', 'production_orders', 'quality_checks',
        'batches', 'tailors', 'tailor_assignments', 'tailor_skills', 'tailor_attendance',
        'order_batch_assignments', 'order_batch_size_distributions',
        'purchase_orders', 'purchase_order_items', 'purchase_order_attachments', 'purchase_order_deliveries', 'purchase_order_fabric_details',
        'grn_master', 'grn_items', 'grn_quality_inspections', 'grn_discrepancies', 'grn_attachments', 'grn_items_fabric_details',
        'bom_records', 'bom_record_items',
        'quotations', 'quotation_items', 'invoices', 'invoice_items', 'receipts', 'receipts_items',
        'dispatch_orders', 'dispatch_order_items',
        'warehouses', 'floors', 'racks', 'bins', 'warehouse_inventory', 'warehouse_master', 'inventory_movements',
        'fabric_inventory', 'fabric_storage_zones', 'fabric_picking_records', 'fabric_usage_records'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated users" ON %I', tbl);
        EXECUTE format('CREATE POLICY "Allow all for authenticated users" ON %I FOR ALL USING (auth.role() = ''authenticated'')', tbl);
    END LOOP;
END $$;

-- ============================================================================
-- PART 17: TRIGGERS FOR UPDATED_AT
-- ============================================================================

DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'company_settings', 'profiles', 'customers', 'customer_users', 'customer_portal_settings', 'customer_types',
        'supplier_master', 'employees', 'designations', 'product_categories', 'products', 'size_types', 
        'item_master', 'company_assets', 'fabrics', 'fabric_variants', 'fabric_master',
        'orders', 'order_assignments', 'production_team', 'production_orders', 'batches', 'tailors',
        'tailor_assignments', 'tailor_skills', 'tailor_attendance', 'order_batch_assignments', 'order_batch_size_distributions',
        'purchase_orders', 'grn_master', 'grn_items', 'quotations', 'invoices', 'dispatch_orders',
        'warehouses', 'floors', 'racks', 'bins', 'warehouse_master', 'fabric_storage_zones'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON %I', tbl, tbl);
        EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', tbl, tbl);
    END LOOP;
END $$;

-- ============================================================================
-- PART 18: AUTO-NUMBERING FUNCTIONS
-- ============================================================================

-- Generate Order Number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
    next_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 3) AS INTEGER)), 0) + 1
    INTO next_num FROM orders WHERE order_number LIKE 'OR%';
    RETURN 'OR' || LPAD(next_num::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

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

-- Generate PO Number
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TEXT AS $$
DECLARE
    next_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(po_number FROM 3) AS INTEGER)), 0) + 1
    INTO next_num FROM purchase_orders WHERE po_number LIKE 'PO%';
    RETURN 'PO' || LPAD(next_num::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Generate GRN Number
CREATE OR REPLACE FUNCTION generate_grn_number()
RETURNS TEXT AS $$
DECLARE
    next_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(grn_number FROM 5) AS INTEGER)), 0) + 1
    INTO next_num FROM grn_master WHERE grn_number LIKE 'GRN-%';
    RETURN 'GRN-' || LPAD(next_num::TEXT, 6, '0');
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

DROP TRIGGER IF EXISTS trigger_set_grn_number ON grn_master;
CREATE TRIGGER trigger_set_grn_number
    BEFORE INSERT ON grn_master
    FOR EACH ROW
    EXECUTE FUNCTION set_grn_number();

-- Update Batch Capacity
CREATE OR REPLACE FUNCTION update_batch_capacity()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE batches 
        SET current_capacity = (
            SELECT COUNT(*) FROM tailors 
            WHERE batch_id = NEW.batch_id AND status = 'active'
        )
        WHERE id = NEW.batch_id;
    END IF;
    
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.batch_id IS DISTINCT FROM NEW.batch_id) THEN
        UPDATE batches 
        SET current_capacity = (
            SELECT COUNT(*) FROM tailors 
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

SELECT 
    'Migration completed successfully!' as status,
    '74 tables created' as tables,
    'Ready for application use' as ready;

-- ============================================================================
-- CREATE VIEWS - Run After Tables Migration
-- Generated: October 8, 2025
-- Description: Creates all views for complex queries
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
        WHEN qc.status = 'passed' THEN qc.check_date::timestamptz
        WHEN disp.status = 'delivered' THEN disp.dispatch_date::timestamptz
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
-- 4. QC REVIEWS VIEW
-- ============================================================================
DROP VIEW IF EXISTS qc_reviews CASCADE;
CREATE VIEW qc_reviews AS
SELECT
    qc.id,
    qc.order_id,
    qc.production_order_id,
    qc.order_batch_assignment_id,
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

-- ============================================================================
-- 5. GOODS RECEIPT NOTES VIEW
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
    po.po_number,
    po.order_date as po_date,
    sm.supplier_name,
    sm.supplier_code,
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
    w.name as warehouse_name,
    w.code as warehouse_code,
    b.bin_code,
    b.location_type as bin_location_type,
    COALESCE(im.item_name, f.name) as item_name,
    COALESCE(im.item_code, '') as item_code,
    wi.last_updated,
    wi.created_at
FROM warehouse_inventory wi
LEFT JOIN warehouses w ON wi.warehouse_id = w.id
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
GROUP BY f.id, f.name, fv.id, fv.color, fv.gsm, fv.hex_code, fv.uom, fv.rate_per_meter, 
         fv.stock_quantity, f.image_url, fv.image_url;

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

SELECT 'Successfully created all 9 views!' as status;

