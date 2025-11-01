-- Fix the relationship between orders and employees tables
-- This script will help establish the proper foreign key relationship

-- 1. First, let's check if the sales_manager column exists in the orders table
-- and if it references the employees table properly

-- Check current structure of orders table
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'orders' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if there's a foreign key constraint already
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM
    information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
    AND rc.constraint_schema = tc.table_schema
WHERE
    tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name = 'orders'
    AND (ccu.table_name = 'employees' OR kcu.column_name = 'sales_manager');

-- 2. If the sales_manager column doesn't exist, add it
-- ALTER TABLE public.orders 
-- ADD COLUMN IF NOT EXISTS sales_manager UUID;

-- 3. If the column exists but there's no foreign key constraint, add it
-- First drop any existing constraint with the same name
-- ALTER TABLE public.orders 
-- DROP CONSTRAINT IF EXISTS orders_sales_manager_fkey;

-- Add the foreign key constraint
-- ALTER TABLE public.orders 
-- ADD CONSTRAINT orders_sales_manager_fkey
--    FOREIGN KEY (sales_manager)
--    REFERENCES public.employees(id) ON DELETE SET NULL;

-- 4. Alternative approach: If you want to use a different column name
-- ALTER TABLE public.orders 
-- ADD COLUMN IF NOT EXISTS assigned_sales_manager UUID;

-- ALTER TABLE public.orders 
-- ADD CONSTRAINT orders_assigned_sales_manager_fkey
--    FOREIGN KEY (assigned_sales_manager)
--    REFERENCES public.employees(id) ON DELETE SET NULL;

-- 5. Update any existing orders with sales manager IDs if needed
-- This is just an example - replace with actual employee IDs from your database
-- UPDATE public.orders 
-- SET sales_manager = (SELECT id FROM public.employees WHERE role = 'sales manager' LIMIT 1)
-- WHERE sales_manager IS NULL;

-- 6. Verify the relationship works
-- SELECT 
--     o.order_number,
--     o.sales_manager,
--     e.full_name as sales_manager_name,
--     e.avatar_url
-- FROM public.orders o
-- LEFT JOIN public.employees e ON o.sales_manager = e.id
-- LIMIT 5;

-- Instructions:
-- 1. Run this script in your Supabase SQL Editor
-- 2. Uncomment the sections you need (remove the -- at the beginning)
-- 3. Make sure you have employees in your database first
-- 4. Test the query at the end to verify the relationship works
-- 5. Once the relationship is established, the Sales Manager avatar feature can be re-enabled
