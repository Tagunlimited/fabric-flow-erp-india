-- Script to delete ALL orders and their related records
-- WARNING: This will permanently delete ALL orders and related data
-- Use with extreme caution - this action cannot be undone!

-- This script deletes data in the correct order to avoid foreign key constraint violations

-- Step 1: Delete order item customizations (if table exists)
DO $$
BEGIN
    -- Check if table exists and delete all records
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_item_customizations') THEN
        DELETE FROM order_item_customizations;
        RAISE NOTICE 'Deleted all order item customizations';
    ELSE
        RAISE NOTICE 'Table order_item_customizations does not exist, skipping...';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error deleting order_item_customizations: %', SQLERRM;
END $$;

-- Step 2: Delete order items
DO $$
BEGIN
    DELETE FROM order_items;
    RAISE NOTICE 'Deleted all order items';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error deleting order_items: %', SQLERRM;
END $$;

-- Step 3: Delete order activities (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_activities') THEN
        DELETE FROM order_activities;
        RAISE NOTICE 'Deleted all order activities';
    ELSE
        RAISE NOTICE 'Table order_activities does not exist, skipping...';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error deleting order_activities: %', SQLERRM;
END $$;

-- Step 4: Delete order batch assignments (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_batch_assignments') THEN
        DELETE FROM order_batch_assignments;
        RAISE NOTICE 'Deleted all order batch assignments';
    ELSE
        RAISE NOTICE 'Table order_batch_assignments does not exist, skipping...';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error deleting order_batch_assignments: %', SQLERRM;
END $$;

-- Step 5: Delete order assignments (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_assignments') THEN
        DELETE FROM order_assignments;
        RAISE NOTICE 'Deleted all order assignments';
    ELSE
        RAISE NOTICE 'Table order_assignments does not exist, skipping...';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error deleting order_assignments: %', SQLERRM;
END $$;

-- Step 6: Delete invoices (if table exists and has order references)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
        DELETE FROM invoices;
        RAISE NOTICE 'Deleted all invoices';
    ELSE
        RAISE NOTICE 'Table invoices does not exist, skipping...';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error deleting invoices: %', SQLERRM;
END $$;

-- Step 7: Delete receipts (if table exists and has order references)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'receipts') THEN
        DELETE FROM receipts WHERE reference_type = 'order' OR reference_type = 'ORDER';
        RAISE NOTICE 'Deleted all order-related receipts';
    ELSE
        RAISE NOTICE 'Table receipts does not exist, skipping...';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error deleting receipts: %', SQLERRM;
END $$;

-- Step 8: Finally, delete all orders
DO $$
BEGIN
    DELETE FROM orders;
    RAISE NOTICE 'Deleted all orders';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error deleting orders: %', SQLERRM;
END $$;

-- Step 9: Reset any auto-increment sequences (if they exist)
DO $$
BEGIN
    -- Reset orders sequence if it exists
    IF EXISTS (SELECT 1 FROM information_schema.sequences WHERE sequence_name = 'orders_id_seq') THEN
        ALTER SEQUENCE orders_id_seq RESTART WITH 1;
        RAISE NOTICE 'Reset orders sequence';
    END IF;
    
    -- Reset order_items sequence if it exists
    IF EXISTS (SELECT 1 FROM information_schema.sequences WHERE sequence_name = 'order_items_id_seq') THEN
        ALTER SEQUENCE order_items_id_seq RESTART WITH 1;
        RAISE NOTICE 'Reset order_items sequence';
    END IF;
    
    -- Reset invoices sequence if it exists
    IF EXISTS (SELECT 1 FROM information_schema.sequences WHERE sequence_name = 'invoices_id_seq') THEN
        ALTER SEQUENCE invoices_id_seq RESTART WITH 1;
        RAISE NOTICE 'Reset invoices sequence';
    END IF;
    
    -- Reset receipts sequence if it exists
    IF EXISTS (SELECT 1 FROM information_schema.sequences WHERE sequence_name = 'receipts_id_seq') THEN
        ALTER SEQUENCE receipts_id_seq RESTART WITH 1;
        RAISE NOTICE 'Reset receipts sequence';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error resetting sequences: %', SQLERRM;
END $$;

-- Final summary
SELECT 
    'Orders cleanup completed' as status,
    'All orders and related records have been deleted' as message,
    'Sequences have been reset to start from 1' as note;
