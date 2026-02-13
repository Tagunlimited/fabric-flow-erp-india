-- Fix Order Lifecycle Triggers (Run this after functions)
-- This creates the triggers for automatic activity logging

-- Create trigger function for orders table
CREATE OR REPLACE FUNCTION trigger_order_activity_log()
RETURNS TRIGGER AS $$
DECLARE
    activity_type TEXT;
    activity_description TEXT;
    metadata JSONB;
BEGIN
    -- Determine activity type
    IF TG_OP = 'INSERT' THEN
        activity_type := 'order_created';
        activity_description := 'Order created';
        metadata := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        activity_type := 'order_updated';
        activity_description := 'Order details updated';
        metadata := jsonb_build_object('old_values', to_jsonb(OLD), 'new_values', to_jsonb(NEW));
        
        -- Check for specific changes
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            activity_type := 'status_changed';
            activity_description := format('Order status changed from %s to %s', OLD.status, NEW.status);
            metadata := jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status);
        ELSIF OLD.expected_delivery_date IS DISTINCT FROM NEW.expected_delivery_date THEN
            activity_type := 'delivery_date_updated';
            activity_description := format('Expected delivery date updated from %s to %s', 
                OLD.expected_delivery_date::date, NEW.expected_delivery_date::date);
            metadata := jsonb_build_object('old_date', OLD.expected_delivery_date, 'new_date', NEW.expected_delivery_date);
        ELSIF OLD.final_amount IS DISTINCT FROM NEW.final_amount THEN
            activity_type := 'amount_updated';
            activity_description := format('Order amount updated from %s to %s', 
                OLD.final_amount, NEW.final_amount);
            metadata := jsonb_build_object('old_amount', OLD.final_amount, 'new_amount', NEW.final_amount);
        ELSIF OLD.sales_manager IS DISTINCT FROM NEW.sales_manager THEN
            activity_type := 'sales_manager_changed';
            activity_description := 'Sales manager assigned/changed';
            metadata := jsonb_build_object('old_sales_manager', OLD.sales_manager, 'new_sales_manager', NEW.sales_manager);
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        activity_type := 'order_deleted';
        activity_description := 'Order deleted';
        metadata := to_jsonb(OLD);
    END IF;
    
    -- Log the activity
    PERFORM log_order_activity(
        COALESCE(NEW.id, OLD.id),
        activity_type,
        activity_description,
        metadata
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for orders table
DROP TRIGGER IF EXISTS trigger_order_activity_log ON orders;
CREATE TRIGGER trigger_order_activity_log
    AFTER INSERT OR UPDATE OR DELETE ON orders
    FOR EACH ROW EXECUTE FUNCTION trigger_order_activity_log();

-- Create trigger function for order_items table
CREATE OR REPLACE FUNCTION trigger_order_item_activity_log()
RETURNS TRIGGER AS $$
DECLARE
    activity_type TEXT;
    activity_description TEXT;
    metadata JSONB;
BEGIN
    -- Determine activity type
    IF TG_OP = 'INSERT' THEN
        activity_type := 'item_added';
        activity_description := format('Product item added: %s', NEW.product_description);
        metadata := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        activity_type := 'item_updated';
        activity_description := format('Product item updated: %s', NEW.product_description);
        metadata := jsonb_build_object('old_values', to_jsonb(OLD), 'new_values', to_jsonb(NEW));
        
        -- Check for specific changes
        IF OLD.quantity IS DISTINCT FROM NEW.quantity THEN
            activity_type := 'quantity_updated';
            activity_description := format('Quantity updated from %s to %s for %s', 
                OLD.quantity, NEW.quantity, NEW.product_description);
            metadata := jsonb_build_object('old_quantity', OLD.quantity, 'new_quantity', NEW.quantity, 'product', NEW.product_description);
        ELSIF OLD.unit_price IS DISTINCT FROM NEW.unit_price THEN
            activity_type := 'price_updated';
            activity_description := format('Unit price updated from %s to %s for %s', 
                OLD.unit_price, NEW.unit_price, NEW.product_description);
            metadata := jsonb_build_object('old_price', OLD.unit_price, 'new_price', NEW.unit_price, 'product', NEW.product_description);
        ELSIF OLD.specifications IS DISTINCT FROM NEW.specifications THEN
            activity_type := 'specifications_updated';
            activity_description := format('Specifications updated for %s', NEW.product_description);
            metadata := jsonb_build_object('product', NEW.product_description);
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        activity_type := 'item_removed';
        activity_description := format('Product item removed: %s', OLD.product_description);
        metadata := to_jsonb(OLD);
    END IF;
    
    -- Log the activity
    PERFORM log_order_activity(
        COALESCE(NEW.order_id, OLD.order_id),
        activity_type,
        activity_description,
        metadata
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for order_items table
DROP TRIGGER IF EXISTS trigger_order_item_activity_log ON order_items;
CREATE TRIGGER trigger_order_item_activity_log
    AFTER INSERT OR UPDATE OR DELETE ON order_items
    FOR EACH ROW EXECUTE FUNCTION trigger_order_item_activity_log();
