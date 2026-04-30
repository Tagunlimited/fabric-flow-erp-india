-- Backfill automatic quotation numbers to match historical order serial rule:
-- TUC/YY-YY/MON/NNN  ->  SO/YY-YY/MON/NNN
-- This only targets automatic quotations linked to orders.

WITH linked_orders AS (
  SELECT
    q.id AS quotation_id,
    q.quotation_number AS old_quotation_number,
    o.order_number,
    o.order_date
  FROM public.quotations q
  JOIN public.orders o
    ON (q.order_id IS NOT NULL AND o.id = q.order_id)
    OR (q.order_id IS NULL AND q.order_number IS NOT NULL AND o.order_number = q.order_number)
  WHERE COALESCE(q.source, 'automatic') = 'automatic'
    AND q.manual_quotation_id IS NULL
    AND o.order_number ~ '/[0-9]+$'
    AND o.order_date IS NOT NULL
),
normalized AS (
  SELECT
    quotation_id,
    old_quotation_number,
    'SO/'
      || CASE
        WHEN EXTRACT(MONTH FROM order_date) < 4
          THEN RIGHT((EXTRACT(YEAR FROM order_date)::int - 1)::text, 2)
               || '-' ||
               RIGHT((EXTRACT(YEAR FROM order_date)::int)::text, 2)
        ELSE RIGHT((EXTRACT(YEAR FROM order_date)::int)::text, 2)
             || '-' ||
             RIGHT((EXTRACT(YEAR FROM order_date)::int + 1)::text, 2)
      END
      || '/'
      || UPPER(TO_CHAR(order_date, 'MON'))
      || '/'
      || LPAD((regexp_match(order_number, '/(\d+)$'))[1], 3, '0') AS new_quotation_number
  FROM linked_orders
),
safe_updates AS (
  SELECT n.*
  FROM normalized n
  WHERE n.new_quotation_number IS NOT NULL
    AND n.old_quotation_number IS DISTINCT FROM n.new_quotation_number
    AND NOT EXISTS (
      SELECT 1
      FROM public.quotations q2
      WHERE q2.quotation_number = n.new_quotation_number
        AND q2.id <> n.quotation_id
    )
)
UPDATE public.quotations q
SET
  quotation_number = u.new_quotation_number,
  updated_at = NOW()
FROM safe_updates u
WHERE q.id = u.quotation_id;
