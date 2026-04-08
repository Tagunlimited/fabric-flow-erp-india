-- One-time targeted correction:
-- For order TUC/26-27/APR/006, relink order_items.fabric_id to the 180 GSM
-- variant of the same base fabric + color (where possible), and set order_items.gsm to 180.

DO $$
DECLARE
  v_order_id UUID;
BEGIN
  SELECT id
  INTO v_order_id
  FROM public.orders
  WHERE order_number = 'TUC/26-27/APR/006'
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE NOTICE 'Order TUC/26-27/APR/006 not found. Skipping targeted 180 GSM fix.';
    RETURN;
  END IF;

  WITH line_ctx AS (
    SELECT
      oi.id AS order_item_id,
      oi.fabric_id AS old_fabric_id,
      COALESCE(NULLIF(TRIM(oi.color), ''), fm_old.color) AS target_color,
      fm_old.fabric_name AS base_fabric_name
    FROM public.order_items oi
    LEFT JOIN public.fabric_master fm_old ON fm_old.id = oi.fabric_id
    WHERE oi.order_id = v_order_id
  ),
  resolved AS (
    SELECT DISTINCT ON (lc.order_item_id)
      lc.order_item_id,
      fm_new.id AS new_fabric_id
    FROM line_ctx lc
    JOIN public.fabric_master fm_new
      ON LOWER(TRIM(fm_new.fabric_name)) = LOWER(TRIM(lc.base_fabric_name))
     AND (
       lc.target_color IS NULL
       OR LOWER(TRIM(fm_new.color)) = LOWER(TRIM(lc.target_color))
     )
     AND REGEXP_REPLACE(COALESCE(fm_new.gsm::text, ''), '[^0-9.]', '', 'g') = '180'
    ORDER BY lc.order_item_id, fm_new.id
  )
  UPDATE public.order_items oi
  SET
    fabric_id = r.new_fabric_id,
    gsm = '180'
  FROM resolved r
  WHERE oi.id = r.order_item_id;

  RAISE NOTICE 'Applied targeted fabric relink to 180 GSM for order %.', 'TUC/26-27/APR/006';
END $$;
