-- Fix the "v_total_dispatched" column error in order_items table
-- This error occurs when there's a trigger or view trying to reference a non-existent column

-- 1. Check for any views that might reference v_total_dispatched
DO $$
DECLARE
    view_name text;
    view_definition text;
BEGIN
    FOR view_name IN 
        SELECT schemaname||'.'||viewname 
        FROM pg_views 
        WHERE schemaname = 'public' 
        AND definition ILIKE '%v_total_dispatched%'
    LOOP
        RAISE NOTICE 'Found view referencing v_total_dispatched: %', view_name;
    END LOOP;
END $$;

-- 2. Check for any triggers that might reference v_total_dispatched
DO $$
DECLARE
    trigger_name text;
    function_name text;
BEGIN
    FOR trigger_name, function_name IN 
        SELECT t.tgname, p.proname
        FROM pg_trigger t
        JOIN pg_proc p ON t.tgfoid = p.oid
        WHERE p.prosrc ILIKE '%v_total_dispatched%'
    LOOP
        RAISE NOTICE 'Found trigger referencing v_total_dispatched: % (function: %)', trigger_name, function_name;
    END LOOP;
END $$;

-- 3. Check for any functions that might reference v_total_dispatched
DO $$
DECLARE
    function_name text;
BEGIN
    FOR function_name IN 
        SELECT proname
        FROM pg_proc
        WHERE prosrc ILIKE '%v_total_dispatched%'
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    LOOP
        RAISE NOTICE 'Found function referencing v_total_dispatched: %', function_name;
    END LOOP;
END $$;

-- 4. Drop any problematic triggers on order_items table
DROP TRIGGER IF EXISTS trigger_update_order_totals ON public.order_items;
DROP TRIGGER IF EXISTS trigger_order_item_activity_log ON public.order_items;

-- 5. Drop any problematic functions that might reference v_total_dispatched
DROP FUNCTION IF EXISTS update_order_totals();
DROP FUNCTION IF EXISTS trigger_order_item_activity_log();

-- 6. Create a simple, working trigger function for order_items (without v_total_dispatched reference)
CREATE OR REPLACE FUNCTION trigger_order_item_activity_log()
RETURNS TRIGGER AS $$
DECLARE
    activity_type VARCHAR(50);
    activity_description TEXT;
    old_values JSONB;
    new_values JSONB;
BEGIN
    -- Determine activity type
    IF TG_OP = 'INSERT' THEN
        activity_type := 'item_added';
        activity_description := format('Product item added: %s', NEW.product_description);
        new_values := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        activity_type := 'item_updated';
        activity_description := format('Product item updated: %s', NEW.product_description);
        old_values := to_jsonb(OLD);
        new_values := to_jsonb(NEW);
        
        -- Check for specific changes
        IF OLD.quantity IS DISTINCT FROM NEW.quantity THEN
            activity_type := 'quantity_updated';
            activity_description := format('Quantity updated from %s to %s for %s', 
                OLD.quantity, NEW.quantity, NEW.product_description);
        ELSIF OLD.unit_price IS DISTINCT FROM NEW.unit_price THEN
            activity_type := 'price_updated';
            activity_description := format('Unit price updated from %s to %s for %s', 
                OLD.unit_price, NEW.unit_price, NEW.product_description);
        ELSIF OLD.specifications IS DISTINCT FROM NEW.specifications THEN
            activity_type := 'specifications_updated';
            activity_description := format('Specifications updated for %s', NEW.product_description);
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        activity_type := 'item_removed';
        activity_description := format('Product item removed: %s', OLD.product_description);
        old_values := to_jsonb(OLD);
    END IF;
    
    -- Only log if we have an order_activities table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_activities' AND table_schema = 'public') THEN
        INSERT INTO public.order_activities (
            order_id,
            activity_type,
            activity_description,
            old_values,
            new_values,
            created_at
        ) VALUES (
            COALESCE(NEW.order_id, OLD.order_id),
            activity_type,
            activity_description,
            old_values,
            new_values,
            NOW()
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 7. Recreate the trigger for order_items table
CREATE TRIGGER trigger_order_item_activity_log
    AFTER INSERT OR UPDATE OR DELETE ON public.order_items
    FOR EACH ROW EXECUTE FUNCTION trigger_order_item_activity_log();

-- 8. Create a simple function to update order totals (without v_total_dispatched reference)
CREATE OR REPLACE FUNCTION update_order_totals()
RETURNS TRIGGER AS $$
DECLARE
    order_total DECIMAL(12,2);
    order_tax DECIMAL(12,2);
    order_final DECIMAL(12,2);
    order_id_val UUID;
BEGIN
    -- Get the order_id from the trigger context
    order_id_val := COALESCE(NEW.order_id, OLD.order_id);
    
    -- Calculate totals from order_items
    SELECT 
        COALESCE(SUM(total_price), 0),
        COALESCE(SUM(total_price * 0.18), 0), -- Default 18% GST
        COALESCE(SUM(total_price * 1.18), 0)  -- Total with GST
    INTO order_total, order_tax, order_final
    FROM public.order_items
    WHERE order_id = order_id_val;
    
    -- Update the order
    UPDATE public.orders 
    SET 
        total_amount = order_total,
        tax_amount = order_tax,
        final_amount = order_final,
        balance_amount = order_final - COALESCE(advance_amount, 0),
        updated_at = NOW()
    WHERE id = order_id_val;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 9. Create trigger for order totals update
CREATE TRIGGER trigger_update_order_totals
    AFTER INSERT OR UPDATE OR DELETE ON public.order_items
    FOR EACH ROW EXECUTE FUNCTION update_order_totals();

-- 10. Verify the order_items table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'order_items' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 11. Test insert to make sure it works
-- This is just a test - don't actually insert
-- INSERT INTO public.order_items (order_id, quantity, unit_price, total_price, product_description) 
-- VALUES ('00000000-0000-0000-0000-000000000000', 1, 100, 100, 'Test Item');

RAISE NOTICE 'Order items table triggers and functions have been fixed. The v_total_dispatched error should be resolved.';
