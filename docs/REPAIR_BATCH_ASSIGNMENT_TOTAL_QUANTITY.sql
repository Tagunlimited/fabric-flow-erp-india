-- Backfill order_batch_assignments.total_quantity from size distribution rows.
-- Fixes audit finding FULLY_CUT_BUT_HEADER_ASSIGNED_LOW (header total < sum of size rows).
--
-- Run in Supabase SQL editor. Review the preview SELECT first, then run the transaction block.

-- Preview: assignments where header total differs from size-row sum
SELECT
  oba.id,
  oba.order_id,
  o.order_number,
  oba.total_quantity AS header_total,
  COALESCE(sz.size_sum, 0) AS size_row_sum,
  COALESCE(sz.size_sum, 0) - COALESCE(oba.total_quantity, 0) AS delta
FROM public.order_batch_assignments oba
LEFT JOIN public.orders o ON o.id = oba.order_id
LEFT JOIN (
  SELECT
    obsd.order_batch_assignment_id,
    SUM(
      GREATEST(
        COALESCE(obsd.assigned_quantity, 0),
        COALESCE(obsd.quantity, 0)
      )
    )::integer AS size_sum
  FROM public.order_batch_size_distributions obsd
  GROUP BY obsd.order_batch_assignment_id
) sz ON sz.order_batch_assignment_id = oba.id
WHERE COALESCE(oba.total_quantity, 0) <> COALESCE(sz.size_sum, 0)
ORDER BY o.order_number NULLS LAST, oba.created_at;

-- Apply fix (transactional)
BEGIN;

UPDATE public.order_batch_assignments oba
SET
  total_quantity = sub.size_sum,
  updated_at = NOW()
FROM (
  SELECT
    obsd.order_batch_assignment_id,
    SUM(
      GREATEST(
        COALESCE(obsd.assigned_quantity, 0),
        COALESCE(obsd.quantity, 0)
      )
    )::integer AS size_sum
  FROM public.order_batch_size_distributions obsd
  GROUP BY obsd.order_batch_assignment_id
) sub
WHERE oba.id = sub.order_batch_assignment_id
  AND COALESCE(oba.total_quantity, 0) <> sub.size_sum;

COMMIT;
