-- Fix delete order trigger issue
-- The issue is that there's a trigger trying to log order deletion activities
-- but it runs after the order is deleted, causing foreign key constraint violations

-- Option 1: Temporarily disable the trigger during deletion
-- This is the safest approach

-- First, let's check what triggers exist on the orders table
SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'orders';

-- If there's a trigger that logs activities, we need to handle it properly
-- Let's create a function that can safely delete an order with all its related data

CREATE OR REPLACE FUNCTION safe_delete_order(order_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    order_exists BOOLEAN;
BEGIN
    -- Check if order exists
    SELECT EXISTS(SELECT 1 FROM orders WHERE id = order_uuid) INTO order_exists;
    
    IF NOT order_exists THEN
        RETURN FALSE;
    END IF;
    
    -- Delete in correct order to avoid foreign key violations
    -- 1. Delete order item customizations (if table exists)
    BEGIN
        DELETE FROM order_item_customizations 
        WHERE order_item_id IN (
            SELECT id FROM order_items WHERE order_id = order_uuid
        );
    EXCEPTION WHEN undefined_table THEN
        -- Table doesn't exist, continue
        NULL;
    END;
    
    -- 2. Delete order items
    DELETE FROM order_items WHERE order_id = order_uuid;
    
    -- 3. Delete order activities
    DELETE FROM order_activities WHERE order_id = order_uuid;
    
    -- 4. Finally delete the order
    DELETE FROM orders WHERE id = order_uuid;
    
    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    -- Log the error and return false
    RAISE LOG 'Error deleting order %: %', order_uuid, SQLERRM;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION safe_delete_order(UUID) TO authenticated;
