-- Fix RLS policies for sidebar_items table to allow authenticated users to insert/update
-- Run this in your Supabase SQL editor

-- Drop existing SELECT-only policy if it exists
DROP POLICY IF EXISTS "Authenticated users can view sidebar items" ON sidebar_items;

-- Create policies that allow full access for authenticated users
CREATE POLICY "Authenticated users can view sidebar items" ON sidebar_items
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert sidebar items" ON sidebar_items
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update sidebar items" ON sidebar_items
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Verify the policies are created
SELECT schemaname, tablename, policyname, permissive, roles 
FROM pg_policies 
WHERE tablename = 'sidebar_items';

SELECT '✅ RLS policies updated successfully! You can now sync sub-menus.' as status;
