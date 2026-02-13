-- Setup script for sidebar_items table
-- Run this in your Supabase SQL editor

-- Create the sidebar_items table
CREATE TABLE IF NOT EXISTS sidebar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT,
  icon TEXT NOT NULL,
  parent_id UUID REFERENCES sidebar_items(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE sidebar_items ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users (drop if exists first)
DROP POLICY IF EXISTS "Authenticated users can view sidebar items" ON sidebar_items;
CREATE POLICY "Authenticated users can view sidebar items" ON sidebar_items
  FOR SELECT TO authenticated USING (true);

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
