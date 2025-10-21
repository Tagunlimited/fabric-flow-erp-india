-- ============================================================================
-- SIDEBAR PERMISSIONS SYSTEM
-- Generated: January 2025
-- Description: Creates a comprehensive role-based sidebar access control system
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE SIDEBAR PERMISSIONS TABLES
-- ============================================================================

-- 1. Sidebar Items Table - Defines all available sidebar items
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

-- 2. Role Sidebar Permissions - Defines which sidebar items each role can access
CREATE TABLE IF NOT EXISTS role_sidebar_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    sidebar_item_id UUID NOT NULL REFERENCES sidebar_items(id) ON DELETE CASCADE,
    can_view BOOLEAN DEFAULT true,
    can_edit BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role_id, sidebar_item_id)
);

-- 3. User Sidebar Permissions - Individual user overrides for sidebar access
CREATE TABLE IF NOT EXISTS user_sidebar_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sidebar_item_id UUID NOT NULL REFERENCES sidebar_items(id) ON DELETE CASCADE,
    can_view BOOLEAN DEFAULT true,
    can_edit BOOLEAN DEFAULT false,
    is_override BOOLEAN DEFAULT false, -- True if this overrides role permissions
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, sidebar_item_id)
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
SELECT 'Dashboard', '/warehouse/inventory', 'Building', id, 1
FROM sidebar_items WHERE title = 'Inventory'
ON CONFLICT DO NOTHING;

-- Insert Production sub-items
INSERT INTO sidebar_items (title, url, icon, parent_id, sort_order)
SELECT sub_items.title, sub_items.url, sub_items.icon, sidebar_items.id, sub_items.sort_order
FROM (VALUES
    ('Production Dashboard', '/production', 'Factory', 1),
    ('Assign Orders', '/production/assign-orders', 'Users', 2),
    ('Cutting Manager', '/production/cutting-manager', 'Scissors', 3),
    ('Tailor Management', '/production/tailor-management', 'Users', 4)
) AS sub_items(title, url, icon, sort_order)
CROSS JOIN sidebar_items WHERE sidebar_items.title = 'Production'
ON CONFLICT DO NOTHING;

-- Insert Quality Check sub-items
INSERT INTO sidebar_items (title, url, icon, parent_id, sort_order)
SELECT sub_items.title, sub_items.url, sub_items.icon, sidebar_items.id, sub_items.sort_order
FROM (VALUES
    ('Picker', '/production/picker', 'Package', 1),
    ('QC', '/quality/checks', 'CheckCircle', 2),
    ('Dispatch', '/quality/dispatch', 'Truck', 3)
) AS sub_items(title, url, icon, sort_order)
CROSS JOIN sidebar_items WHERE sidebar_items.title = 'Quality Check'
ON CONFLICT DO NOTHING;

-- Insert People sub-items
INSERT INTO sidebar_items (title, url, icon, parent_id, sort_order)
SELECT sub_items.title, sub_items.url, sub_items.icon, sidebar_items.id, sub_items.sort_order
FROM (VALUES
    ('Dashboard', '/people', 'BarChart3', 1),
    ('Our People', '/people/employees', 'Users', 2),
    ('Production Team', '/people/production-team', 'Scissors', 3),
    ('Departments', '/people/departments', 'Building', 4),
    ('Designations', '/people/designations', 'Award', 5)
) AS sub_items(title, url, icon, sort_order)
CROSS JOIN sidebar_items WHERE sidebar_items.title = 'People'
ON CONFLICT DO NOTHING;

-- Insert Masters sub-items
INSERT INTO sidebar_items (title, url, icon, parent_id, sort_order)
SELECT sub_items.title, sub_items.url, sub_items.icon, sidebar_items.id, sub_items.sort_order
FROM (VALUES
    ('Masters Dashboard', '/masters', 'Package', 1),
    ('Product Master', '/masters/products', 'Package', 2),
    ('Item Master', '/masters/items', 'Package', 3),
    ('Product Categories', '/inventory/product-categories', 'Package', 4),
    ('Fabric Master', '/inventory/fabrics', 'Palette', 5),
    ('Size Master', '/inventory/size-types', 'ClipboardList', 6),
    ('Warehouse Master', '/masters/warehouses', 'Building', 7),
    ('Customer Type Master', '/masters/customer-types', 'Users', 8),
    ('Supplier Master', '/masters/suppliers', 'Truck', 9)
) AS sub_items(title, url, icon, sort_order)
CROSS JOIN sidebar_items WHERE sidebar_items.title = 'Masters'
ON CONFLICT DO NOTHING;

-- Insert User & Roles sub-items
INSERT INTO sidebar_items (title, url, icon, parent_id, sort_order)
SELECT sub_items.title, sub_items.url, sub_items.icon, sidebar_items.id, sub_items.sort_order
FROM (VALUES
    ('Employee Access', '/admin/employee-access', 'Users', 1),
    ('Customer Access', '/admin/customer-access', 'Users', 2)
) AS sub_items(title, url, icon, sort_order)
CROSS JOIN sidebar_items WHERE sidebar_items.title = 'User & Roles'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 3: SETUP DEFAULT ROLE PERMISSIONS
-- ============================================================================

-- Admin gets access to everything
INSERT INTO role_sidebar_permissions (role_id, sidebar_item_id, can_view, can_edit)
SELECT r.id, si.id, true, true
FROM roles r
CROSS JOIN sidebar_items si
WHERE r.name = 'Admin'
ON CONFLICT (role_id, sidebar_item_id) DO NOTHING;

-- Production Manager gets access to most modules except admin functions
INSERT INTO role_sidebar_permissions (role_id, sidebar_item_id, can_view, can_edit)
SELECT r.id, si.id, true, false
FROM roles r
CROSS JOIN sidebar_items si
WHERE r.name = 'Production Manager'
AND si.title NOT IN ('User & Roles', 'Configuration')
ON CONFLICT (role_id, sidebar_item_id) DO NOTHING;

-- Sales Manager gets access to CRM, Orders, Accounts, and basic modules
INSERT INTO role_sidebar_permissions (role_id, sidebar_item_id, can_view, can_edit)
SELECT r.id, si.id, true, false
FROM roles r
CROSS JOIN sidebar_items si
WHERE r.name = 'Sales Manager'
AND si.title IN ('Dashboard', 'CRM', 'Orders', 'Accounts', 'Design & Printing', 'People')
ON CONFLICT (role_id, sidebar_item_id) DO NOTHING;

-- Inventory Manager gets access to inventory and procurement
INSERT INTO role_sidebar_permissions (role_id, sidebar_item_id, can_view, can_edit)
SELECT r.id, si.id, true, false
FROM roles r
CROSS JOIN sidebar_items si
WHERE r.name = 'Inventory Manager'
AND si.title IN ('Dashboard', 'Inventory', 'Procurement', 'Masters', 'People')
ON CONFLICT (role_id, sidebar_item_id) DO NOTHING;

-- QC Manager gets access to quality and production
INSERT INTO role_sidebar_permissions (role_id, sidebar_item_id, can_view, can_edit)
SELECT r.id, si.id, true, false
FROM roles r
CROSS JOIN sidebar_items si
WHERE r.name = 'QC Manager'
AND si.title IN ('Dashboard', 'Quality Check', 'Production', 'People')
ON CONFLICT (role_id, sidebar_item_id) DO NOTHING;

-- ============================================================================
-- PART 4: ENABLE ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE sidebar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_sidebar_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sidebar_permissions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for sidebar_items
CREATE POLICY "Authenticated users can view sidebar items"
    ON sidebar_items FOR SELECT
    TO authenticated
    USING (is_active = true);

-- Create RLS policies for role_sidebar_permissions
CREATE POLICY "Authenticated users can view role sidebar permissions"
    ON role_sidebar_permissions FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Admins can manage role sidebar permissions"
    ON role_sidebar_permissions FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE user_id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Create RLS policies for user_sidebar_permissions
CREATE POLICY "Users can view their own sidebar permissions"
    ON user_sidebar_permissions FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all user sidebar permissions"
    ON user_sidebar_permissions FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE user_id = auth.uid() 
            AND role = 'admin'
        )
    );

-- ============================================================================
-- PART 5: CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function to get user's effective sidebar permissions
CREATE OR REPLACE FUNCTION get_user_sidebar_permissions(user_uuid UUID)
RETURNS TABLE (
    sidebar_item_id UUID,
    title TEXT,
    url TEXT,
    icon TEXT,
    parent_id UUID,
    sort_order INTEGER,
    can_view BOOLEAN,
    can_edit BOOLEAN,
    permission_source TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH user_role_permissions AS (
        -- Get permissions from user's roles
        SELECT 
            si.id as sidebar_item_id,
            si.title,
            si.url,
            si.icon,
            si.parent_id,
            si.sort_order,
            rsp.can_view,
            rsp.can_edit,
            'role' as permission_source
        FROM sidebar_items si
        JOIN role_sidebar_permissions rsp ON si.id = rsp.sidebar_item_id
        JOIN user_roles ur ON rsp.role_id = ur.role_id
        WHERE ur.user_id = user_uuid
        AND si.is_active = true
    ),
    user_override_permissions AS (
        -- Get user-specific overrides
        SELECT 
            si.id as sidebar_item_id,
            si.title,
            si.url,
            si.icon,
            si.parent_id,
            si.sort_order,
            usp.can_view,
            usp.can_edit,
            'override' as permission_source
        FROM sidebar_items si
        JOIN user_sidebar_permissions usp ON si.id = usp.sidebar_item_id
        WHERE usp.user_id = user_uuid
        AND usp.is_override = true
        AND si.is_active = true
    ),
    combined_permissions AS (
        -- Combine role and override permissions, with overrides taking precedence
        SELECT 
            sidebar_item_id,
            title,
            url,
            icon,
            parent_id,
            sort_order,
            can_view,
            can_edit,
            permission_source
        FROM user_override_permissions
        UNION ALL
        SELECT 
            sidebar_item_id,
            title,
            url,
            icon,
            parent_id,
            sort_order,
            can_view,
            can_edit,
            permission_source
        FROM user_role_permissions
        WHERE sidebar_item_id NOT IN (
            SELECT sidebar_item_id FROM user_override_permissions
        )
    )
    SELECT DISTINCT ON (sidebar_item_id)
        sidebar_item_id,
        title,
        url,
        icon,
        parent_id,
        sort_order,
        can_view,
        can_edit,
        permission_source
    FROM combined_permissions
    ORDER BY sidebar_item_id, 
             CASE WHEN permission_source = 'override' THEN 1 ELSE 2 END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 6: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sidebar_items_parent_id ON sidebar_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_sidebar_items_sort_order ON sidebar_items(sort_order);
CREATE INDEX IF NOT EXISTS idx_sidebar_items_is_active ON sidebar_items(is_active);

CREATE INDEX IF NOT EXISTS idx_role_sidebar_permissions_role_id ON role_sidebar_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_sidebar_permissions_sidebar_item_id ON role_sidebar_permissions(sidebar_item_id);

CREATE INDEX IF NOT EXISTS idx_user_sidebar_permissions_user_id ON user_sidebar_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sidebar_permissions_sidebar_item_id ON user_sidebar_permissions(sidebar_item_id);
CREATE INDEX IF NOT EXISTS idx_user_sidebar_permissions_is_override ON user_sidebar_permissions(is_override);

-- ============================================================================
-- PART 7: GRANT PERMISSIONS
-- ============================================================================

-- Grant necessary permissions to authenticated users
GRANT SELECT ON sidebar_items TO authenticated;
GRANT SELECT ON role_sidebar_permissions TO authenticated;
GRANT SELECT ON user_sidebar_permissions TO authenticated;

-- Grant execute permission on the helper function
GRANT EXECUTE ON FUNCTION get_user_sidebar_permissions(UUID) TO authenticated;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Sidebar permissions system created successfully!';
    RAISE NOTICE 'Tables created: sidebar_items, role_sidebar_permissions, user_sidebar_permissions';
    RAISE NOTICE 'Default sidebar items and role permissions have been inserted';
    RAISE NOTICE 'Helper function get_user_sidebar_permissions() is available';
    RAISE NOTICE 'You can now use the admin interface to manage sidebar permissions';
END $$;
