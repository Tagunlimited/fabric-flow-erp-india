-- Insert sidebar items only (table and policy already exist)
-- Run this in your Supabase SQL editor

-- Clear existing data first (optional)
-- DELETE FROM sidebar_items;

-- Insert default sidebar items
INSERT INTO sidebar_items (title, url, icon, sort_order, is_active) VALUES
('Dashboard', '/dashboard', 'Home', 1, true),
('CRM', NULL, 'Users', 2, true),
('Orders', '/orders', 'ShoppingCart', 3, true),
('Accounts', NULL, 'Calculator', 4, true),
('Design & Printing', '/design', 'Palette', 5, true),
('Procurement', NULL, 'ShoppingBag', 6, true),
('Inventory', NULL, 'Package', 7, true),
('Production', NULL, 'Factory', 8, true),
('Quality Check', '/quality', 'CheckCircle', 9, true),
('People', NULL, 'Users', 10, true),
('Masters', NULL, 'Package', 11, true),
('User & Roles', NULL, 'UserCog', 12, true),
('Configuration', '/configuration', 'Settings', 13, true),
('Reports', '/reports', 'FileText', 14, true)
ON CONFLICT DO NOTHING;

-- Verify the data
SELECT COUNT(*) as total_items FROM sidebar_items;
SELECT title, url, icon, sort_order FROM sidebar_items ORDER BY sort_order;
