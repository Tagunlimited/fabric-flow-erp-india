-- Fix Order Lifecycle Data (Run this last)
-- This adds initial activities for existing orders

-- Insert initial activities for existing orders (only if they don't already exist)
INSERT INTO order_activities (order_id, activity_type, activity_description, metadata, performed_at)
SELECT 
    id,
    'order_created',
    'Order created',
    to_jsonb(orders.*),
    created_at
FROM orders
WHERE created_at IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM order_activities oa 
    WHERE oa.order_id = orders.id 
    AND oa.activity_type = 'order_created'
);

-- Show completion message
SELECT 'Order lifecycle tracking system setup completed successfully!' as status;
