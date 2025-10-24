-- Fix Order Lifecycle Tracking System
-- This script ensures the comprehensive order lifecycle tracking is properly set up

-- 1. Drop the conflicting simple view first
DROP VIEW IF EXISTS order_lifecycle_view CASCADE;

-- 2. Create order_activities table if it doesn't exist (using existing structure)
CREATE TABLE IF NOT EXISTS order_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL,
    activity_description TEXT,
    performed_by UUID,
    performed_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_order_activities_order_id ON order_activities(order_id);
CREATE INDEX IF NOT EXISTS idx_order_activities_activity_type ON order_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_order_activities_performed_at ON order_activities(performed_at);
CREATE INDEX IF NOT EXISTS idx_order_activities_performed_by ON order_activities(performed_by);

-- 4. Create function to log order activities (updated for existing table structure)
CREATE OR REPLACE FUNCTION log_order_activity(
    p_order_id UUID,
    p_activity_type TEXT,
    p_activity_description TEXT,
    p_metadata JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO order_activities (
        order_id,
        activity_type,
        activity_description,
        metadata,
        performed_by
    ) VALUES (
        p_order_id,
        p_activity_type,
        p_activity_description,
        p_metadata,
        auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create trigger function for orders table (updated for existing table structure)
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

-- 6. Create trigger for orders table
DROP TRIGGER IF EXISTS trigger_order_activity_log ON orders;
CREATE TRIGGER trigger_order_activity_log
    AFTER INSERT OR UPDATE OR DELETE ON orders
    FOR EACH ROW EXECUTE FUNCTION trigger_order_activity_log();

-- 7. Create trigger function for order_items table (updated for existing table structure)
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

-- 8. Create trigger for order_items table
DROP TRIGGER IF EXISTS trigger_order_item_activity_log ON order_items;
CREATE TRIGGER trigger_order_item_activity_log
    AFTER INSERT OR UPDATE OR DELETE ON order_items
    FOR EACH ROW EXECUTE FUNCTION trigger_order_item_activity_log();

-- 9. Create function to manually log custom activities (updated for existing table structure)
CREATE OR REPLACE FUNCTION log_custom_order_activity(
    p_order_id UUID,
    p_activity_type TEXT,
    p_activity_description TEXT,
    p_metadata JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    PERFORM log_order_activity(
        p_order_id,
        p_activity_type,
        p_activity_description,
        p_metadata
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Create function to log payment activities (updated for existing table structure)
CREATE OR REPLACE FUNCTION log_payment_activity(
    p_order_id UUID,
    p_payment_amount DECIMAL(10,2),
    p_payment_type VARCHAR(50),
    p_payment_reference VARCHAR(100),
    p_notes TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    PERFORM log_order_activity(
        p_order_id,
        'payment_received',
        format('Payment received: %s via %s', p_payment_amount, p_payment_type),
        jsonb_build_object(
            'payment_amount', p_payment_amount,
            'payment_type', p_payment_type,
            'payment_reference', p_payment_reference,
            'notes', p_notes
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Create function to log file upload activities (updated for existing table structure)
CREATE OR REPLACE FUNCTION log_file_upload_activity(
    p_order_id UUID,
    p_file_type VARCHAR(50),
    p_file_name VARCHAR(255),
    p_file_url TEXT,
    p_item_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    PERFORM log_order_activity(
        p_order_id,
        'file_uploaded',
        format('%s uploaded: %s', p_file_type, p_file_name),
        jsonb_build_object(
            'file_type', p_file_type,
            'file_name', p_file_name,
            'file_url', p_file_url,
            'item_id', p_item_id
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Enable RLS on order_activities table
ALTER TABLE order_activities ENABLE ROW LEVEL SECURITY;

-- 13. Create RLS policies for order_activities
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON order_activities;
CREATE POLICY "Enable read access for authenticated users" ON order_activities
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON order_activities;
CREATE POLICY "Enable insert access for authenticated users" ON order_activities
    FOR INSERT TO authenticated WITH CHECK (true);

-- 14. Create comprehensive view for order lifecycle with user information (updated for existing table structure)
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

-- 15. Insert initial activities for existing orders (only if they don't already exist)
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

-- 16. Show the created structure
SELECT 'Order lifecycle tracking system fixed and created successfully!' as status;
