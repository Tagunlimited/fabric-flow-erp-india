-- Complete script to cleanup duplicates and add constraints
-- Run this in your Supabase SQL editor

-- Step 1: Show current duplicates
SELECT 
  title, 
  url, 
  COALESCE(parent_id::text, 'NULL') as parent_id, 
  COUNT(*) as count
FROM sidebar_items
WHERE is_active = true
GROUP BY title, url, parent_id
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- Step 2: Add UNIQUE constraint to prevent duplicates
-- This will fail if duplicates exist, so we'll delete them first

-- Step 3: Delete ALL sidebar items to start fresh
DELETE FROM sidebar_items;

-- Step 4: Add UNIQUE constraint
ALTER TABLE sidebar_items 
ADD CONSTRAINT unique_sidebar_item 
UNIQUE (title, url, parent_id);

-- Step 5: Re-insert the sidebar items correctly
INSERT INTO sidebar_items (title, url, icon, parent_id, sort_order, is_active) VALUES
-- Root items
('Dashboard', '/', 'Home', NULL, 1, true),
('CRM', NULL, 'Users', NULL, 2, true),
('Orders', '/orders', 'ShoppingCart', NULL, 3, true),
('Accounts', NULL, 'Calculator', NULL, 4, true),
('Design & Printing', '/design', 'Palette', NULL, 5, true),
('Procurement', NULL, 'ShoppingBag', NULL, 6, true),
('Inventory', NULL, 'Package', NULL, 7, true),
('Production', NULL, 'Factory', NULL, 8, true),
('Quality Check', '/quality', 'CheckCircle', NULL, 9, true),
('People', NULL, 'Users', NULL, 10, true),
('Masters', NULL, 'Package', NULL, 11, true),
('User & Roles', NULL, 'UserCog', NULL, 12, true),
('Configuration', '/configuration', 'Settings', NULL, 13, true),
('Reports', '/reports', 'FileText', NULL, 14, true),
-- CRM Children
('Create/View Customers', '/crm/customers', 'Users', 
 (SELECT id FROM sidebar_items WHERE title = 'CRM' LIMIT 1), 1, true),
-- Orders Children  
('Custom Orders', '/orders', 'ShoppingCart',
 (SELECT id FROM sidebar_items WHERE title = 'Orders' LIMIT 1), 1, true),
-- Accounts Children
('View Quotation', '/accounts/quotations', 'Calculator',
 (SELECT id FROM sidebar_items WHERE title = 'Accounts' LIMIT 1), 1, true),
('Create/View Invoices', '/accounts/invoices', 'Calculator',
 (SELECT id FROM sidebar_items WHERE title = 'Accounts' LIMIT 1), 2, true),
('Receipts', '/accounts/receipts', 'Calculator',
 (SELECT id FROM sidebar_items WHERE title = 'Accounts' LIMIT 1), 3, true),
('Payments', '/accounts/payments', 'Calculator',
 (SELECT id FROM sidebar_items WHERE title = 'Accounts' LIMIT 1), 4, true),
-- Procurement Children
('Bills of Materials', '/bom', 'ClipboardList',
 (SELECT id FROM sidebar_items WHERE title = 'Procurement' LIMIT 1), 1, true),
('Purchase Orders', '/procurement/po', 'ShoppingBag',
 (SELECT id FROM sidebar_items WHERE title = 'Procurement' LIMIT 1), 2, true),
('Goods Receipt Note', '/procurement/grn', 'ClipboardList',
 (SELECT id FROM sidebar_items WHERE title = 'Procurement' LIMIT 1), 3, true),
('Return to Vendor', '/procurement/returns', 'Truck',
 (SELECT id FROM sidebar_items WHERE title = 'Procurement' LIMIT 1), 4, true),
('Material Shortfall Alerts', '/procurement/alerts', 'AlertTriangle',
 (SELECT id FROM sidebar_items WHERE title = 'Procurement' LIMIT 1), 5, true),
-- Inventory Children
('Dashboard', '/warehouse/inventory', 'Building',
 (SELECT id FROM sidebar_items WHERE title = 'Inventory' LIMIT 1), 1, true),
-- Production Children
('Production Dashboard', '/production', 'Factory',
 (SELECT id FROM sidebar_items WHERE title = 'Production' LIMIT 1), 1, true),
('Assign Orders', '/production/assign-orders', 'Users',
 (SELECT id FROM sidebar_items WHERE title = 'Production' LIMIT 1), 2, true),
('Cutting Manager', '/production/cutting-manager', 'Scissors',
 (SELECT id FROM sidebar_items WHERE title = 'Production' LIMIT 1), 3, true),
('Tailor Management', '/production/tailor-management', 'Users',
 (SELECT id FROM sidebar_items WHERE title = 'Production' LIMIT 1), 4, true),
-- Quality Check Children
('Picker', '/production/picker', 'Package',
 (SELECT id FROM sidebar_items WHERE title = 'Quality Check' LIMIT 1), 1, true),
('QC', '/quality/checks', 'CheckCircle',
 (SELECT id FROM sidebar_items WHERE title = 'Quality Check' LIMIT 1), 2, true),
('Dispatch', '/quality/dispatch', 'Truck',
 (SELECT id FROM sidebar_items WHERE title = 'Quality Check' LIMIT 1), 3, true),
-- People Children
('Dashboard', '/people', 'BarChart3',
 (SELECT id FROM sidebar_items WHERE title = 'People' LIMIT 1), 1, true),
('Our People', '/people/employees', 'Users',
 (SELECT id FROM sidebar_items WHERE title = 'People' LIMIT 1), 2, true),
('Departments', '/people/departments', 'Building',
 (SELECT id FROM sidebar_items WHERE title = 'People' LIMIT 1), 3, true),
('Designations', '/people/designations', 'Award',
 (SELECT id FROM sidebar_items WHERE title = 'People' LIMIT 1), 4, true),
-- Masters Children
('Masters Dashboard', '/masters', 'Package',
 (SELECT id FROM sidebar_items WHERE title = 'Masters' LIMIT 1), 1, true),
('Product Master', '/masters/products', 'Package',
 (SELECT id FROM sidebar_items WHERE title = 'Masters' LIMIT 1), 2, true),
('Item Master', '/masters/items', 'Package',
 (SELECT id FROM sidebar_items WHERE title = 'Masters' LIMIT 1), 3, true),
('Product Categories', '/inventory/product-categories', 'Package',
 (SELECT id FROM sidebar_items WHERE title = 'Masters' LIMIT 1), 4, true),
('Fabric Master', '/inventory/fabrics', 'Palette',
 (SELECT id FROM sidebar_items WHERE title = 'Masters' LIMIT 1), 5, true),
('Size Master', '/inventory/size-types', 'ClipboardList',
 (SELECT id FROM sidebar_items WHERE title = 'Masters' LIMIT 1), 6, true),
('Warehouse Master', '/masters/warehouses', 'Building',
 (SELECT id FROM sidebar_items WHERE title = 'Masters' LIMIT 1), 7, true),
('Customer Type Master', '/masters/customer-types', 'Users',
 (SELECT id FROM sidebar_items WHERE title = 'Masters' LIMIT 1), 8, true),
('Supplier Master', '/masters/suppliers', 'Truck',
 (SELECT id FROM sidebar_items WHERE title = 'Masters' LIMIT 1), 9, true),
-- User & Roles Children
('Employee Access', '/admin/employee-access', 'Users',
 (SELECT id FROM sidebar_items WHERE title = 'User & Roles' LIMIT 1), 1, true),
('Customer Access', '/admin/customer-access', 'Users',
 (SELECT id FROM sidebar_items WHERE title = 'User & Roles' LIMIT 1), 2, true);

-- Step 6: Verify the data
SELECT COUNT(*) as total_items FROM sidebar_items WHERE is_active = true;
SELECT COUNT(*) as parent_items FROM sidebar_items WHERE is_active = true AND parent_id IS NULL;
SELECT COUNT(*) as child_items FROM sidebar_items WHERE is_active = true AND parent_id IS NOT NULL;

SELECT '✅ Sidebar items cleaned up and unique constraint added!' as status;
