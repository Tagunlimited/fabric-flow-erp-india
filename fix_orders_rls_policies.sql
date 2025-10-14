-- Fix Row Level Security (RLS) policies for orders table
-- This script will enable proper access to the orders table

-- First, let's check if RLS is enabled on the orders table
SELECT 'Checking RLS status on orders table:' as info;
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'orders';

-- Check existing policies on orders table
SELECT 'Existing policies on orders table:' as info;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'orders';

-- Enable RLS on orders table if not already enabled
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Enable read access for all users" ON orders;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON orders;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON orders;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON orders;

-- Create comprehensive RLS policies for orders table

-- Policy 1: Allow authenticated users to read all orders
CREATE POLICY "Enable read access for authenticated users" ON orders
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy 2: Allow authenticated users to insert orders
CREATE POLICY "Enable insert access for authenticated users" ON orders
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Policy 3: Allow authenticated users to update orders
CREATE POLICY "Enable update access for authenticated users" ON orders
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Policy 4: Allow authenticated users to delete orders
CREATE POLICY "Enable delete access for authenticated users" ON orders
    FOR DELETE
    TO authenticated
    USING (true);

-- Also check and fix order_items table RLS policies
SELECT 'Checking RLS status on order_items table:' as info;
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'order_items';

-- Enable RLS on order_items table if not already enabled
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies on order_items if they exist
DROP POLICY IF EXISTS "Enable read access for all users" ON order_items;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON order_items;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON order_items;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON order_items;

-- Create RLS policies for order_items table

-- Policy 1: Allow authenticated users to read all order items
CREATE POLICY "Enable read access for authenticated users" ON order_items
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy 2: Allow authenticated users to insert order items
CREATE POLICY "Enable insert access for authenticated users" ON order_items
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Policy 3: Allow authenticated users to update order items
CREATE POLICY "Enable update access for authenticated users" ON order_items
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Policy 4: Allow authenticated users to delete order items
CREATE POLICY "Enable delete access for authenticated users" ON order_items
    FOR DELETE
    TO authenticated
    USING (true);

-- Show the final policies
SELECT 'Final policies on orders table:' as info;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'orders';

SELECT 'Final policies on order_items table:' as info;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'order_items';

-- Verify RLS is enabled
SELECT 'Final RLS status:' as info;
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('orders', 'order_items');
