-- Preview script to see what will be deleted before running the actual deletion
-- This script shows counts of records that will be deleted without actually deleting them

-- This is a SAFE script that only shows counts - no data is deleted

SELECT 'PREVIEW: Records that will be deleted' as info;

-- Count order item customizations
SELECT 
    'order_item_customizations' as table_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_item_customizations') 
        THEN (SELECT COUNT(*) FROM order_item_customizations)::text
        ELSE 'Table does not exist'
    END as record_count;

-- Count order items
SELECT 
    'order_items' as table_name,
    (SELECT COUNT(*) FROM order_items)::text as record_count;

-- Count order activities
SELECT 
    'order_activities' as table_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_activities') 
        THEN (SELECT COUNT(*) FROM order_activities)::text
        ELSE 'Table does not exist'
    END as record_count;

-- Count order batch assignments
SELECT 
    'order_batch_assignments' as table_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_batch_assignments') 
        THEN (SELECT COUNT(*) FROM order_batch_assignments)::text
        ELSE 'Table does not exist'
    END as record_count;

-- Count order assignments
SELECT 
    'order_assignments' as table_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_assignments') 
        THEN (SELECT COUNT(*) FROM order_assignments)::text
        ELSE 'Table does not exist'
    END as record_count;

-- Count invoices
SELECT 
    'invoices' as table_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') 
        THEN (SELECT COUNT(*) FROM invoices)::text
        ELSE 'Table does not exist'
    END as record_count;

-- Count order-related receipts
SELECT 
    'receipts (order-related)' as table_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'receipts') 
        THEN (SELECT COUNT(*) FROM receipts WHERE reference_type = 'order' OR reference_type = 'ORDER')::text
        ELSE 'Table does not exist'
    END as record_count;

-- Count orders
SELECT 
    'orders' as table_name,
    (SELECT COUNT(*) FROM orders)::text as record_count;

-- Show some sample order data before deletion
SELECT 'Sample orders that will be deleted:' as info;

SELECT 
    id,
    order_number,
    order_date,
    status,
    total_amount,
    created_at
FROM orders 
ORDER BY created_at DESC 
LIMIT 10;

-- Show total counts summary
SELECT 
    'SUMMARY' as info,
    (SELECT COUNT(*) FROM orders) as total_orders,
    (SELECT COUNT(*) FROM order_items) as total_order_items,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_activities') 
        THEN (SELECT COUNT(*) FROM order_activities)
        ELSE 0
    END as total_order_activities,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') 
        THEN (SELECT COUNT(*) FROM invoices)
        ELSE 0
    END as total_invoices;
