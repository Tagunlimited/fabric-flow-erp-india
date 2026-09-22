-- Run in live Supabase SQL editor AFTER/AFTER applying
-- 20260922160000_allocate_order_number_loop_until_free.sql

-- 1) Current FY max vs counter
WITH fy AS (
  SELECT CASE
    WHEN EXTRACT(MONTH FROM CURRENT_DATE) < 4 THEN
      to_char(date_trunc('year', CURRENT_DATE) - interval '1 year', 'YY')
      || '-'
      || to_char(date_trunc('year', CURRENT_DATE), 'YY')
    ELSE
      to_char(date_trunc('year', CURRENT_DATE), 'YY')
      || '-'
      || to_char(date_trunc('year', CURRENT_DATE) + interval '1 year', 'YY')
  END AS fy
)
SELECT
  'TUC' AS prefix,
  f.fy,
  (SELECT COALESCE(MAX((substring(o.order_number FROM '/([0-9]+)$'))::int), 0)
   FROM orders o
   WHERE o.order_number LIKE 'TUC/' || f.fy || '/%') AS max_in_orders,
  (SELECT c.last_seq
   FROM order_number_counters c
   WHERE c.prefix = 'TUC' AND c.fy = f.fy) AS counter_last_seq,
  (SELECT o.order_number
   FROM orders o
   WHERE o.order_number LIKE 'TUC/' || f.fy || '/%'
   ORDER BY (substring(o.order_number FROM '/([0-9]+)$'))::int DESC
   LIMIT 1) AS highest_order_number
FROM fy f;

-- 2) Does RPC exist and what does it return?
SELECT public.allocate_order_number('TUC') AS next_allocated_number;

-- 3) Confirm that number is not already in orders (should be 0 rows)
-- Re-run section 2, paste the returned value below:
-- SELECT * FROM orders WHERE order_number = 'TUC/26-27/???';
