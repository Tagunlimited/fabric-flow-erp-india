-- ============================================================================
-- FIX: Remaining 404 Errors - Missing Views and Functions
-- Generated: October 8, 2025
-- Description: Fix remaining 404 errors for missing views and functions
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE FABRIC_PICKING_SUMMARY VIEW
-- ============================================================================

SELECT '=== CREATING FABRIC_PICKING_SUMMARY VIEW ===' as info;

-- Create fabric_picking_summary view
CREATE OR REPLACE VIEW fabric_picking_summary AS
SELECT 
    o.id as order_id,
    o.order_number,
    c.company_name as customer_name,
    -- Fabric details
    f.id as fabric_id,
    f.fabric_name,
    f.color as fabric_color,
    f.gsm as fabric_gsm,
    f.image as fabric_image_url,
    -- Order item details
    oi.id as order_item_id,
    oi.product_description,
    oi.quantity as ordered_quantity,
    oi.sizes_quantities,
    -- Warehouse inventory
    wi.id as warehouse_item_id,
    wi.quantity as available_quantity,
    wi.bin_id,
    wi.status as inventory_status,
    wi.received_date,
    -- Calculated fields
    CASE 
        WHEN wi.quantity >= oi.quantity THEN 'sufficient'
        WHEN wi.quantity > 0 THEN 'partial'
        ELSE 'insufficient'
    END as availability_status,
    LEAST(wi.quantity, oi.quantity) as allocatable_quantity
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN order_items oi ON o.id = oi.order_id
JOIN fabric_master f ON oi.fabric_id = f.id
LEFT JOIN warehouse_inventory wi ON f.id = wi.item_id AND wi.item_type = 'fabric'
WHERE wi.quantity > 0 OR wi.quantity IS NULL
ORDER BY o.order_number, f.fabric_name;

-- ============================================================================
-- PART 2: CREATE ENSURE_FABRIC_INVENTORY_FOR_ORDER FUNCTION
-- ============================================================================

SELECT '=== CREATING ENSURE_FABRIC_INVENTORY_FOR_ORDER FUNCTION ===' as info;

CREATE OR REPLACE FUNCTION ensure_fabric_inventory_for_order(order_id_param UUID)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    result JSON;
    order_fabrics JSON;
BEGIN
    -- Get all fabrics for the order
    SELECT json_agg(
        json_build_object(
            'fabric_id', f.id,
            'fabric_name', f.fabric_name,
            'fabric_color', f.color,
            'fabric_gsm', f.gsm,
            'ordered_quantity', oi.quantity,
            'available_quantity', COALESCE(wi.quantity, 0),
            'availability_status', CASE 
                WHEN COALESCE(wi.quantity, 0) >= oi.quantity THEN 'sufficient'
                WHEN COALESCE(wi.quantity, 0) > 0 THEN 'partial'
                ELSE 'insufficient'
            END
        )
    ) INTO order_fabrics
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    JOIN fabric_master f ON oi.fabric_id = f.id
    LEFT JOIN warehouse_inventory wi ON f.id = wi.item_id AND wi.item_type = 'fabric'
    WHERE o.id = order_id_param;
    
    RETURN json_build_object(
        'success', true,
        'message', 'Fabric inventory checked for order',
        'order_id', order_id_param,
        'fabrics', COALESCE(order_fabrics, '[]'::json)
    );
END;
$$;

-- ============================================================================
-- PART 3: CREATE GET_ORDER_SIZES FUNCTION
-- ============================================================================

SELECT '=== CREATING GET_ORDER_SIZES FUNCTION ===' as info;

CREATE OR REPLACE FUNCTION get_order_sizes(order_id_param UUID)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_agg(
        json_build_object(
            'size_name', size_name,
            'quantity', quantity
        )
    ) INTO result
    FROM (
        SELECT 
            'S' as size_name,
            COALESCE(SUM(size_s_quantity), 0) as quantity
        FROM order_batch_assignments
        WHERE order_id = order_id_param
        
        UNION ALL
        
        SELECT 
            'M' as size_name,
            COALESCE(SUM(size_m_quantity), 0) as quantity
        FROM order_batch_assignments
        WHERE order_id = order_id_param
        
        UNION ALL
        
        SELECT 
            'L' as size_name,
            COALESCE(SUM(size_l_quantity), 0) as quantity
        FROM order_batch_assignments
        WHERE order_id = order_id_param
        
        UNION ALL
        
        SELECT 
            'XL' as size_name,
            COALESCE(SUM(size_xl_quantity), 0) as quantity
        FROM order_batch_assignments
        WHERE order_id = order_id_param
        
        UNION ALL
        
        SELECT 
            'XXL' as size_name,
            COALESCE(SUM(size_xxl_quantity), 0) as quantity
        FROM order_batch_assignments
        WHERE order_id = order_id_param
        
        UNION ALL
        
        SELECT 
            'XXXL' as size_name,
            COALESCE(SUM(size_xxxl_quantity), 0) as quantity
        FROM order_batch_assignments
        WHERE order_id = order_id_param
    ) sizes
    WHERE quantity > 0;
    
    RETURN COALESCE(result, '[]'::json);
END;
$$;

-- ============================================================================
-- PART 4: VERIFICATION
-- ============================================================================

SELECT '=== VERIFICATION ===' as info;

-- Test the fabric_picking_summary view
SELECT 'Fabric Picking Summary View Test:' as section;
SELECT 
    order_id,
    order_number,
    customer_name,
    fabric_name,
    fabric_color,
    available_quantity,
    ordered_quantity,
    availability_status
FROM fabric_picking_summary
WHERE order_id = 'a64ba7b3-bf52-4771-8f9e-75bbc928885f'
LIMIT 5;

-- Test the ensure_fabric_inventory_for_order function
SELECT 'Ensure Fabric Inventory Function Test:' as section;
SELECT ensure_fabric_inventory_for_order('a64ba7b3-bf52-4771-8f9e-75bbc928885f');

-- Test the get_order_sizes function
SELECT 'Get Order Sizes Function Test:' as section;
SELECT get_order_sizes('a64ba7b3-bf52-4771-8f9e-75bbc928885f');

SELECT 'Remaining 404 Errors Fix Completed Successfully!' as status;
