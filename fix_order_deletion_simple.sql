-- Simple fix for order deletion that doesn't require special privileges
-- The issue is that there are triggers trying to log activities after order deletion
-- but the order is already deleted, causing foreign key constraint violations

-- Create a simple delete function that handles the deletion in the correct order
-- without trying to disable triggers (which requires superuser privileges)

CREATE OR REPLACE FUNCTION safe_delete_order_simple(order_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
    order_exists BOOLEAN;
    deleted_count INTEGER;
BEGIN
    -- Check if order exists
    SELECT EXISTS(SELECT 1 FROM orders WHERE id = order_uuid) INTO order_exists;
    
    IF NOT order_exists THEN
        RETURN 0; -- Order not found
    END IF;
    
    BEGIN
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
        
        -- 3. Delete order activities (if table exists)
        BEGIN
            DELETE FROM order_activities WHERE order_id = order_uuid;
        EXCEPTION WHEN undefined_table THEN
            -- Table doesn't exist, continue
            NULL;
        END;
        
        -- 4. Delete any other related records
        BEGIN
            -- Delete from order_batch_assignments if exists
            DELETE FROM order_batch_assignments WHERE order_id = order_uuid;
        EXCEPTION WHEN undefined_table THEN
            NULL;
        END;
        
        BEGIN
            -- Delete from order_assignments if exists
            DELETE FROM order_assignments WHERE order_id = order_uuid;
        EXCEPTION WHEN undefined_table THEN
            NULL;
        END;
        
        -- 5. Finally delete the order
        DELETE FROM orders WHERE id = order_uuid;
        
        -- Check if the deletion was successful
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        
        IF deleted_count > 0 THEN
            RETURN 1; -- Successfully deleted
        ELSE
            RETURN 0; -- No rows deleted (order not found)
        END IF;
        
    EXCEPTION WHEN OTHERS THEN
        -- Log the error and return error code
        RAISE LOG 'Error deleting order %: %', order_uuid, SQLERRM;
        RETURN -1; -- Error occurred
    END;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION safe_delete_order_simple(UUID) TO authenticated;

-- Also create a version that just deletes the order without related data
-- This is for cases where the above function fails due to trigger conflicts

CREATE OR REPLACE FUNCTION delete_order_only(order_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
    order_exists BOOLEAN;
    deleted_count INTEGER;
BEGIN
    -- Check if order exists
    SELECT EXISTS(SELECT 1 FROM orders WHERE id = order_uuid) INTO order_exists;
    
    IF NOT order_exists THEN
        RETURN 0; -- Order not found
    END IF;
    
    BEGIN
        -- Just delete the order directly
        -- This might leave orphaned records, but it will delete the order
        DELETE FROM orders WHERE id = order_uuid;
        
        -- Check if the deletion was successful
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        
        IF deleted_count > 0 THEN
            RETURN 1; -- Successfully deleted
        ELSE
            RETURN 0; -- No rows deleted
        END IF;
        
    EXCEPTION WHEN OTHERS THEN
        -- Log the error and return error code
        RAISE LOG 'Error deleting order %: %', order_uuid, SQLERRM;
        RETURN -1; -- Error occurred
    END;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_order_only(UUID) TO authenticated;
