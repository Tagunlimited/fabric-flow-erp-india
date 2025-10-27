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
