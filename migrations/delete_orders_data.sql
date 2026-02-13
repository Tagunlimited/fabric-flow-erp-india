-- Delete all data from orders table and related tables
-- This will remove all orders, order items, and related data

-- Use a single transaction to avoid deadlocks
BEGIN;

-- Delete all records using DELETE instead of TRUNCATE to avoid deadlocks
-- Delete in reverse dependency order

-- Delete order activities first (child table)
DELETE FROM order_activities;

-- Delete order item customizations if table exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_item_customizations') THEN
        EXECUTE 'DELETE FROM order_item_customizations';
    END IF;
END $$;

-- Delete order items
DELETE FROM order_items;

-- Finally delete orders
DELETE FROM orders;

COMMIT;

-- Reset any auto-increment sequences if they exist
-- (PostgreSQL uses UUIDs, but this is here for completeness)
-- SELECT setval('orders_id_seq', 1, false); -- Uncomment if using serial IDs

-- Show confirmation
SELECT 'All orders data has been deleted successfully' as status;
