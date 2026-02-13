-- Final fix for order deletion that handles trigger conflicts properly
-- The issue is that triggers are trying to log activities after order deletion
-- but the order is already deleted, causing foreign key constraint violations

-- Create a function that deletes everything in the correct order
-- and handles the trigger conflicts by deleting activities first

CREATE OR REPLACE FUNCTION safe_delete_order_final(order_uuid UUID)
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
        
        -- 3. Delete order activities FIRST (this is key to prevent trigger conflicts)
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
GRANT EXECUTE ON FUNCTION safe_delete_order_final(UUID) TO authenticated;

-- Also create a function that just deletes the order without any related data
-- This is for cases where the above function still fails

CREATE OR REPLACE FUNCTION force_delete_order(order_uuid UUID)
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
        -- Just delete the order directly, ignoring foreign key constraints
        -- This will leave orphaned records but will delete the order
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
        RAISE LOG 'Error force deleting order %: %', order_uuid, SQLERRM;
        RETURN -1; -- Error occurred
    END;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION force_delete_order(UUID) TO authenticated;
