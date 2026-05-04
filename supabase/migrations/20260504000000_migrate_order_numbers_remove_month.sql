-- Migration to remove month from order numbers and make sequence globally incremental per financial year
-- Old format: TUC/26-27/APR/006 (includes month)
-- New format: TUC/26-27/006 (no month, globally incremental)

DO $body$
DECLARE
  old_format_count INTEGER;
  tuc_count INTEGER;
  rmo_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO old_format_count
  FROM orders
  WHERE order_number ~ '/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/';
  
  IF old_format_count = 0 THEN
    RAISE NOTICE 'No orders with old format found. Skipping migration.';
    RETURN;
  END IF;

  -- Step 1: Create a temporary table to store the mapping of old to new order numbers
  CREATE TEMP TABLE IF NOT EXISTS order_number_mapping (
    old_order_number TEXT PRIMARY KEY,
    new_order_number TEXT NOT NULL,
    order_id UUID NOT NULL
  );

  -- Step 2: Clear any existing data in the mapping table
  TRUNCATE order_number_mapping;

  -- Step 3: For each financial year, renumber orders sequentially (all months together).
  -- ROW_NUMBER is one run per FY (not per month): May orders get the next integers after April
  -- when they sort later by created_at; same sequence continues across the whole year.
  -- First, handle TUC orders (regular orders)
  INSERT INTO order_number_mapping (old_order_number, new_order_number, order_id)
  WITH fy_orders AS (
    SELECT 
      o.id,
      o.order_number AS old_num,
      o.created_at,
      o.order_date,
      SPLIT_PART(SPLIT_PART(o.order_number, '/', 2), '-', 1) AS fy_start,
      SPLIT_PART(SPLIT_PART(o.order_number, '/', 2), '-', 2) AS fy_end
    FROM orders o
    WHERE o.order_number LIKE 'TUC/%' 
      AND o.order_number ~ '/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/'
      AND (o.is_deleted IS NULL OR o.is_deleted = false)
  ),
  ranked_orders AS (
    SELECT 
      id,
      old_num,
      fy_start || '-' || fy_end AS fy_str,
      ROW_NUMBER() OVER (PARTITION BY fy_start, fy_end ORDER BY created_at ASC, id ASC) AS rn
    FROM fy_orders
  )
  SELECT 
    old_num,
    'TUC/' || fy_str || '/' || LPAD(rn::TEXT, 3, '0'),
    id
  FROM ranked_orders;

  -- Step 4: Handle RMO orders (readymade orders)
  INSERT INTO order_number_mapping (old_order_number, new_order_number, order_id)
  WITH fy_orders AS (
    SELECT 
      o.id,
      o.order_number AS old_num,
      o.created_at,
      o.order_date,
      SPLIT_PART(SPLIT_PART(o.order_number, '/', 2), '-', 1) AS fy_start,
      SPLIT_PART(SPLIT_PART(o.order_number, '/', 2), '-', 2) AS fy_end
    FROM orders o
    WHERE o.order_number LIKE 'RMO/%' 
      AND o.order_number ~ '/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/'
      AND (o.is_deleted IS NULL OR o.is_deleted = false)
  ),
  ranked_orders AS (
    SELECT 
      id,
      old_num,
      fy_start || '-' || fy_end AS fy_str,
      ROW_NUMBER() OVER (PARTITION BY fy_start, fy_end ORDER BY created_at ASC, id ASC) AS rn
    FROM fy_orders
  )
  SELECT 
    old_num,
    'RMO/' || fy_str || '/' || LPAD(rn::TEXT, 3, '0'),
    id
  FROM ranked_orders
  ON CONFLICT (old_order_number) DO NOTHING;

  -- Step 5: Update orders table with new order numbers
  UPDATE orders o
  SET order_number = m.new_order_number
  FROM order_number_mapping m
  WHERE o.order_number = m.old_order_number;

  -- Step 6: Update all related tables that reference order_number
  UPDATE order_items oi SET order_number = m.new_order_number FROM order_number_mapping m WHERE oi.order_number = m.old_order_number;
  UPDATE order_activities oa SET order_number = m.new_order_number FROM order_number_mapping m WHERE oa.order_number = m.old_order_number;
  UPDATE quotations q SET order_number = m.new_order_number FROM order_number_mapping m WHERE q.order_number = m.old_order_number;
  
  UPDATE quotations q SET quotation_number = 'SO/' || SPLIT_PART(m.new_order_number, '/', 2) || '/' || SPLIT_PART(m.new_order_number, '/', 3) 
  FROM order_number_mapping m 
  WHERE q.order_number = m.new_order_number 
    AND q.quotation_number LIKE 'SO/%'
    AND q.quotation_number ~ '/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/';
  
  UPDATE invoices i SET order_number = m.new_order_number FROM order_number_mapping m WHERE i.order_number = m.old_order_number;
  UPDATE dispatch_orders d SET order_number = m.new_order_number FROM order_number_mapping m WHERE d.order_number = m.old_order_number;
  UPDATE bom_records b SET order_number = m.new_order_number FROM order_number_mapping m WHERE b.order_number = m.old_order_number;
  UPDATE order_assignments oa SET order_number = m.new_order_number FROM order_number_mapping m WHERE oa.order_number = m.old_order_number;
  UPDATE order_cutting_assignments oca SET order_number = m.new_order_number FROM order_number_mapping m WHERE oca.order_number = m.old_order_number;
  UPDATE order_batch_assignments oba SET order_number = m.new_order_number FROM order_number_mapping m WHERE oba.order_number = m.old_order_number;
  UPDATE qc_reviews qr SET order_number = m.new_order_number FROM order_number_mapping m WHERE qr.order_number = m.old_order_number;
  UPDATE fabric_usage_records fur SET order_number = m.new_order_number FROM order_number_mapping m WHERE fur.order_number = m.old_order_number;
  UPDATE fabric_picking_records fpr SET order_number = m.new_order_number FROM order_number_mapping m WHERE fpr.order_number = m.old_order_number;

  -- Update manual_quotations if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'manual_quotations' AND table_schema = 'public') THEN
    CREATE TEMP TABLE mq_mapping AS
    WITH mq_with_rn AS (
      SELECT 
        mq.id,
        mq.quotation_number,
        'MQ/' || SUBSTRING(mq.quotation_number FROM 'MQ/(\d{2}-\d{2})/') || '/' ||
        LPAD(ROW_NUMBER() OVER (
          PARTITION BY SUBSTRING(mq.quotation_number FROM 'MQ/(\d{2}-\d{2})/') 
          ORDER BY mq.created_at ASC, mq.id ASC
        )::TEXT, 3, '0') AS new_qn
      FROM manual_quotations mq
      WHERE mq.quotation_number LIKE 'MQ/%'
        AND mq.is_deleted = false
        AND mq.quotation_number ~ '/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/'
    )
    SELECT id, quotation_number, new_qn FROM mq_with_rn;
    
    UPDATE manual_quotations mq
    SET quotation_number = m.new_qn
    FROM mq_mapping m
    WHERE mq.id = m.id AND mq.quotation_number = m.quotation_number;
    
    DROP TABLE mq_mapping;
  END IF;

  -- Step 7: Clean up - drop the temporary table
  DROP TABLE IF EXISTS order_number_mapping;

  -- Log the migration
  SELECT COUNT(*) INTO tuc_count FROM orders WHERE order_number LIKE 'TUC/%';
  SELECT COUNT(*) INTO rmo_count FROM orders WHERE order_number LIKE 'RMO/%';
  RAISE NOTICE 'Migration complete: % TUC orders and % RMO orders updated', tuc_count, rmo_count;
END $body$;

-- Step 8: Update the generate_order_number() function to not use month
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $func$
DECLARE
  next_num INTEGER;
  order_num TEXT;
  fy_start TEXT;
  fy_end TEXT;
  fy_str TEXT;
BEGIN
  -- Get current financial year
  IF EXTRACT(MONTH FROM CURRENT_DATE) < 4 THEN
    fy_start := TO_CHAR(DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '1 year', 'YY');
    fy_end := TO_CHAR(DATE_TRUNC('year', CURRENT_DATE), 'YY');
  ELSE
    fy_start := TO_CHAR(DATE_TRUNC('year', CURRENT_DATE), 'YY');
    fy_end := TO_CHAR(DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year', 'YY');
  END IF;
  fy_str := fy_start || '-' || fy_end;
  
  -- Last path segment is always the sequence (old: TUC/26-27/APR/160, new: TUC/26-27/161).
  -- Do not use SPLIT_PART(..., 3): for old format part 3 is the month name and breaks MAX/cast.
  SELECT COALESCE(MAX((SUBSTRING(order_number FROM '/(\d+)$'))::INTEGER), 0) + 1
  INTO next_num
  FROM orders
  WHERE order_number LIKE 'TUC/' || fy_str || '/%';

  order_num := 'TUC/' || fy_str || '/' || LPAD(next_num::TEXT, 3, '0');
  RETURN order_num;
END;
$func$ LANGUAGE plpgsql;
