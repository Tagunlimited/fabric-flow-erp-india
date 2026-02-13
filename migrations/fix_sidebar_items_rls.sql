-- Fix RLS policies for sidebar_items table to allow inserts
-- This will allow the system to add missing sidebar items

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can view sidebar items" ON sidebar_items;
DROP POLICY IF EXISTS "Authenticated users can insert sidebar items" ON sidebar_items;
DROP POLICY IF EXISTS "Authenticated users can update sidebar items" ON sidebar_items;

-- Create new policies that allow all operations for authenticated users
CREATE POLICY "Authenticated users can view sidebar items" ON sidebar_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert sidebar items" ON sidebar_items
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update sidebar items" ON sidebar_items
  FOR UPDATE TO authenticated USING (true);

-- Also add the missing Reports item manually
INSERT INTO sidebar_items (title, url, icon, sort_order, is_active) 
VALUES ('Reports', '/reports', 'FileText', 14, true)
ON CONFLICT (title) DO UPDATE SET
  url = EXCLUDED.url,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- Verify the fix
SELECT title, url, icon, sort_order, is_active 
FROM sidebar_items 
WHERE title = 'Reports';
