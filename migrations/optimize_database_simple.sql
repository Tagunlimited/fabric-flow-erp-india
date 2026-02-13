-- Simplified Database Optimization Script for Fabric Flow ERP
-- Run this in your Supabase SQL Editor to improve performance
-- This version is more robust and handles errors gracefully

-- 1. Add missing indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_at_desc ON purchase_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_status ON purchase_orders(supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id_item_id ON purchase_order_items(po_id, item_id);
CREATE INDEX IF NOT EXISTS idx_supplier_master_supplier_name ON supplier_master(supplier_name);
CREATE INDEX IF NOT EXISTS idx_supplier_master_supplier_code ON supplier_master(supplier_code);

-- 2. Add composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status_created_at ON purchase_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_item_type_po_id ON purchase_order_items(item_type, po_id);

-- 3. Optimize existing indexes (if needed)
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_date ON purchase_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_item_type ON purchase_order_items(item_type);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_item_id ON purchase_order_items(item_id);

-- 4. Analyze tables to update statistics
ANALYZE purchase_orders;
ANALYZE purchase_order_items;
ANALYZE supplier_master;

-- 5. Create a simple optimized function for purchase orders (without materialized view)
CREATE OR REPLACE FUNCTION get_purchase_orders_optimized(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_status TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  po_number VARCHAR,
  supplier_id UUID,
  order_date DATE,
  expected_delivery_date DATE,
  status VARCHAR,
  total_amount DECIMAL,
  created_at TIMESTAMPTZ,
  supplier_name VARCHAR,
  supplier_code VARCHAR,
  primary_contact_name VARCHAR,
  primary_contact_phone VARCHAR,
  primary_contact_email VARCHAR,
  billing_address_line1 TEXT,
  gst_number VARCHAR,
  pan VARCHAR,
  item_count BIGINT,
  total_quantity NUMERIC,
  first_item_image TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    po.id,
    po.po_number,
    po.supplier_id,
    po.order_date,
    po.expected_delivery_date,
    po.status,
    po.total_amount,
    po.created_at,
    s.supplier_name,
    s.supplier_code,
    s.contact_person as primary_contact_name,
    s.phone as primary_contact_phone,
    s.email as primary_contact_email,
    s.billing_address as billing_address_line1,
    s.gst_number,
    s.pan,
    COUNT(poi.id) as item_count,
    SUM(poi.quantity) as total_quantity,
    MIN(poi.item_image_url) FILTER (WHERE poi.item_image_url IS NOT NULL) as first_item_image
  FROM purchase_orders po
  LEFT JOIN supplier_master s ON po.supplier_id = s.id
  LEFT JOIN purchase_order_items poi ON po.id = poi.po_id
  WHERE 
    (p_status IS NULL OR po.status = p_status)
    AND (
      p_search IS NULL 
      OR po.po_number ILIKE '%' || p_search || '%'
      OR s.supplier_name ILIKE '%' || p_search || '%'
      OR s.supplier_code ILIKE '%' || p_search || '%'
    )
  GROUP BY 
    po.id, po.po_number, po.supplier_id, po.order_date, po.expected_delivery_date, 
    po.status, po.total_amount, po.created_at,
    s.supplier_name, s.supplier_code, s.contact_person, s.phone, s.email,
    s.billing_address, s.gst_number, s.pan
  ORDER BY po.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- 6. Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_purchase_orders_optimized TO authenticated;

-- 7. Create a function to clean up old data (optional)
CREATE OR REPLACE FUNCTION cleanup_old_purchase_orders()
RETURNS void AS $$
BEGIN
  -- Delete purchase orders older than 2 years that are completed or cancelled
  DELETE FROM purchase_orders 
  WHERE created_at < NOW() - INTERVAL '2 years'
    AND status IN ('completed', 'cancelled');
    
  -- Log the cleanup
  RAISE NOTICE 'Cleaned up old purchase orders';
END;
$$ LANGUAGE plpgsql;

-- 8. Test the function
DO $$
BEGIN
  RAISE NOTICE 'Testing get_purchase_orders_optimized function...';
  -- This will show the first 5 purchase orders
  PERFORM * FROM get_purchase_orders_optimized(5, 0, NULL, NULL);
  RAISE NOTICE 'Function test completed successfully!';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Function test failed: %', SQLERRM;
END $$;

-- 9. Show summary of what was created
SELECT 
    'Indexes Created' as item,
    COUNT(*) as count
FROM pg_indexes 
WHERE tablename IN ('purchase_orders', 'purchase_order_items', 'supplier_master')
    AND indexname LIKE 'idx_%'

UNION ALL

SELECT 
    'Functions Created' as item,
    COUNT(*) as count
FROM information_schema.routines 
WHERE routine_name IN ('get_purchase_orders_optimized', 'cleanup_old_purchase_orders')

UNION ALL

SELECT 
    'Tables Analyzed' as item,
    COUNT(*) as count
FROM pg_stat_user_tables 
WHERE relname IN ('purchase_orders', 'purchase_order_items', 'supplier_master');

-- 10. Performance test - show query execution plan
EXPLAIN (ANALYZE, BUFFERS) 
SELECT 
    po.id,
    po.po_number,
    po.supplier_id,
    po.order_date,
    po.status,
    po.total_amount,
    s.supplier_name,
    s.supplier_code,
    s.contact_person,
    s.phone,
    s.email
FROM purchase_orders po
LEFT JOIN supplier_master s ON po.supplier_id = s.id
ORDER BY po.created_at DESC
LIMIT 10;
