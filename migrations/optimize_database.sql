-- Database Optimization Script for Fabric Flow ERP
-- Run this in your Supabase SQL Editor to improve performance

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
-- These indexes should already exist from the schema, but let's ensure they're optimized
-- Note: Using regular CREATE INDEX instead of CONCURRENTLY for Supabase compatibility
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_date ON purchase_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_item_type ON purchase_order_items(item_type);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_item_id ON purchase_order_items(item_id);

-- 4. Create a materialized view for purchase order summaries (optional, for very large datasets)
-- This can significantly speed up list views
-- First, let's check if the supplier_master table exists and has the expected columns
DO $$
BEGIN
  -- Check if supplier_master table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'supplier_master') THEN
    -- Create materialized view with the correct column names
    DROP MATERIALIZED VIEW IF EXISTS po_summary_view;
    CREATE MATERIALIZED VIEW po_summary_view AS
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
      NULL as billing_address_line2,
      NULL as billing_address_city,
      NULL as billing_address_state,
      NULL as billing_address_pincode,
      s.gst_number,
      s.pan,
      COUNT(poi.id) as item_count,
      SUM(poi.quantity) as total_quantity,
      MIN(poi.item_image_url) FILTER (WHERE poi.item_image_url IS NOT NULL) as first_item_image
    FROM purchase_orders po
    LEFT JOIN supplier_master s ON po.supplier_id = s.id
    LEFT JOIN purchase_order_items poi ON po.id = poi.po_id
    GROUP BY 
      po.id, po.po_number, po.supplier_id, po.order_date, po.expected_delivery_date, 
      po.status, po.total_amount, po.created_at,
      s.supplier_name, s.supplier_code, s.contact_person, s.phone, s.email,
      s.billing_address, s.gst_number, s.pan;
  ELSE
    RAISE NOTICE 'supplier_master table does not exist. Skipping materialized view creation.';
  END IF;
END $$;

-- 5. Create index on the materialized view (only if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'po_summary_view') THEN
    CREATE INDEX IF NOT EXISTS idx_po_summary_status_created_at ON po_summary_view(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_po_summary_supplier_id ON po_summary_view(supplier_id);
  END IF;
END $$;

-- 6. Create a function to refresh the materialized view (only if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'po_summary_view') THEN
    EXECUTE '
    CREATE OR REPLACE FUNCTION refresh_po_summary()
    RETURNS void AS $func$
    BEGIN
      REFRESH MATERIALIZED VIEW CONCURRENTLY po_summary_view;
    END;
    $func$ LANGUAGE plpgsql;';
  ELSE
    RAISE NOTICE 'po_summary_view does not exist. Skipping refresh function creation.';
  END IF;
END $$;

-- 7. Set up automatic refresh of materialized view (optional)
-- This would require pg_cron extension to be enabled
-- CREATE OR REPLACE FUNCTION schedule_po_summary_refresh()
-- RETURNS void AS $$
-- BEGIN
--   PERFORM cron.schedule('refresh-po-summary', '*/5 * * * *', 'SELECT refresh_po_summary();');
-- END;
-- $$ LANGUAGE plpgsql;

-- 8. Analyze tables to update statistics
ANALYZE purchase_orders;
ANALYZE purchase_order_items;
ANALYZE supplier_master;

-- 9. Create a function to get optimized purchase order list
-- Only create this function if the materialized view exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'po_summary_view') THEN
    EXECUTE '
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
      billing_address_line1 VARCHAR,
      billing_address_line2 VARCHAR,
      billing_address_city VARCHAR,
      billing_address_state VARCHAR,
      billing_address_pincode VARCHAR,
      gst_number VARCHAR,
      pan VARCHAR,
      item_count BIGINT,
      total_quantity NUMERIC,
      first_item_image TEXT
    ) AS $func$
    BEGIN
      RETURN QUERY
      SELECT 
        posv.id,
        posv.po_number,
        posv.supplier_id,
        posv.order_date,
        posv.expected_delivery_date,
        posv.status,
        posv.total_amount,
        posv.created_at,
        posv.supplier_name,
        posv.supplier_code,
        posv.primary_contact_name,
        posv.primary_contact_phone,
        posv.primary_contact_email,
        posv.billing_address_line1,
        posv.billing_address_line2,
        posv.billing_address_city,
        posv.billing_address_state,
        posv.billing_address_pincode,
        posv.gst_number,
        posv.pan,
        posv.item_count,
        posv.total_quantity,
        posv.first_item_image
      FROM po_summary_view posv
      WHERE 
        (p_status IS NULL OR posv.status = p_status)
        AND (
          p_search IS NULL 
          OR posv.po_number ILIKE ''%'' || p_search || ''%''
          OR posv.supplier_name ILIKE ''%'' || p_search || ''%''
          OR posv.supplier_code ILIKE ''%'' || p_search || ''%''
        )
      ORDER BY posv.created_at DESC
      LIMIT p_limit
      OFFSET p_offset;
    END;
    $func$ LANGUAGE plpgsql;';
  ELSE
    RAISE NOTICE 'po_summary_view does not exist. Skipping function creation.';
  END IF;
END $$;

-- 10. Grant necessary permissions (only if functions exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'get_purchase_orders_optimized') THEN
    GRANT EXECUTE ON FUNCTION get_purchase_orders_optimized TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'refresh_po_summary') THEN
    GRANT EXECUTE ON FUNCTION refresh_po_summary TO authenticated;
  END IF;
END $$;

-- 11. Create a trigger to automatically refresh materialized view when data changes (only if view exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'po_summary_view') THEN
    EXECUTE '
    CREATE OR REPLACE FUNCTION trigger_refresh_po_summary()
    RETURNS TRIGGER AS $func$
    BEGIN
      -- Use a more efficient approach: only refresh if significant changes
      PERFORM pg_notify(''refresh_po_summary'', '''');
      RETURN NULL;
    END;
    $func$ LANGUAGE plpgsql;';

    -- Create triggers for purchase_orders table
    DROP TRIGGER IF EXISTS trigger_po_summary_refresh_po ON purchase_orders;
    CREATE TRIGGER trigger_po_summary_refresh_po
      AFTER INSERT OR UPDATE OR DELETE ON purchase_orders
      FOR EACH STATEMENT
      EXECUTE FUNCTION trigger_refresh_po_summary();

    -- Create triggers for purchase_order_items table
    DROP TRIGGER IF EXISTS trigger_po_summary_refresh_poi ON purchase_order_items;
    CREATE TRIGGER trigger_po_summary_refresh_poi
      AFTER INSERT OR UPDATE OR DELETE ON purchase_order_items
      FOR EACH STATEMENT
      EXECUTE FUNCTION trigger_refresh_po_summary();
  ELSE
    RAISE NOTICE 'po_summary_view does not exist. Skipping trigger creation.';
  END IF;
END $$;

-- 12. Create a function to clean up old data (optional)
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

-- 13. Performance monitoring queries
-- Use these to monitor performance improvements

-- Query to check index usage
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan DESC;

-- Query to check table sizes
-- SELECT 
--   schemaname,
--   tablename,
--   pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
-- FROM pg_tables 
-- WHERE schemaname = 'public'
-- ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Query to check slow queries (if enabled)
-- SELECT query, mean_time, calls, total_time
-- FROM pg_stat_statements
-- WHERE query LIKE '%purchase_orders%'
-- ORDER BY mean_time DESC
-- LIMIT 10;

COMMENT ON MATERIALIZED VIEW po_summary_view IS 'Optimized view for purchase order listings with supplier and item summary data';
COMMENT ON FUNCTION get_purchase_orders_optimized IS 'Optimized function to fetch purchase orders with filtering and pagination';
COMMENT ON FUNCTION refresh_po_summary IS 'Function to refresh the purchase order summary materialized view';
