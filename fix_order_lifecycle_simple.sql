-- Fix Order Lifecycle Tracking System (Simplified to avoid deadlocks)
-- Run this script in parts to avoid deadlock issues

-- PART 1: Drop conflicting view first
DROP VIEW IF EXISTS order_lifecycle_view CASCADE;

-- PART 2: Create the comprehensive view
CREATE VIEW order_lifecycle_view AS
SELECT 
    oa.id,
    oa.order_id,
    oa.activity_type,
    oa.activity_description,
    oa.metadata,
    oa.performed_at,
    oa.performed_by,
    u.email as user_email,
    u.raw_user_meta_data->>'full_name' as user_name,
    o.order_number
FROM order_activities oa
LEFT JOIN auth.users u ON oa.performed_by = u.id
LEFT JOIN orders o ON oa.order_id = o.id
ORDER BY oa.performed_at DESC;
