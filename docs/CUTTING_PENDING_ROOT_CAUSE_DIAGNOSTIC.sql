-- Read-only diagnostic for "fully cut + tailor assigned but still pending".
-- Usage (Supabase SQL editor):
--   1) Set order_number below (or replace with a specific order UUID in the temp table).
--   2) Run each SELECT block.

DROP TABLE IF EXISTS _diag_order;
CREATE TEMP TABLE _diag_order AS
SELECT o.id AS order_id
FROM public.orders o
WHERE o.order_number = 'TUC/26-27/187'  -- change to your order
LIMIT 1;

-- 1) Order status + line-level flow flags
SELECT
  o.id AS order_id,
  o.order_number,
  o.status AS order_status,
  oi.id AS order_item_id,
  oi.quantity,
  oi.execution_flow,
  oi.fulfillment_status
FROM public.orders o
JOIN _diag_order d ON d.order_id = o.id
LEFT JOIN public.order_items oi ON oi.order_id = o.id
ORDER BY oi.created_at NULLS LAST;

-- 2) Recorded cut progress in order_assignments (primary source for Cutting Manager)
SELECT
  oa.id,
  oa.order_id,
  oa.cutting_master_id,
  oa.cutting_master_name,
  oa.cutting_work_date,
  oa.cut_quantity,
  oa.cut_quantities_by_size
FROM public.order_assignments oa
JOIN _diag_order d ON d.order_id = oa.order_id
ORDER BY oa.cutting_work_date NULLS LAST, oa.created_at NULLS LAST;

-- 3) Cutting master split rows (can diverge from order_assignments)
SELECT
  oca.id,
  oca.order_id,
  oca.cutting_master_id,
  oca.cutting_master_name,
  oca.assigned_quantity,
  oca.completed_quantity,
  oca.cut_quantities_by_size,
  oca.status
FROM public.order_cutting_assignments oca
JOIN _diag_order d ON d.order_id = oca.order_id
ORDER BY oca.assigned_date NULLS LAST, oca.created_at NULLS LAST;

-- 4) Tailor batch assignments totals
SELECT
  oba.id AS assignment_id,
  oba.order_id,
  oba.batch_id,
  oba.total_quantity,
  oba.notes
FROM public.order_batch_assignments oba
JOIN _diag_order d ON d.order_id = oba.order_id
ORDER BY oba.created_at;

-- 5) Size-wise assigned / picked (join via assignment; obsd has no order_id)
SELECT
  oba.order_id,
  obsd.order_batch_assignment_id,
  obsd.size_name,
  obsd.quantity,
  obsd.assigned_quantity,
  obsd.picked_quantity,
  obsd.completed_quantity
FROM public.order_batch_size_distributions obsd
JOIN public.order_batch_assignments oba ON oba.id = obsd.order_batch_assignment_id
JOIN _diag_order d ON d.order_id = oba.order_id
ORDER BY obsd.order_batch_assignment_id, obsd.size_name;

-- 6) Whether this order still appears in pending flow queue
SELECT v.*
FROM public.v_orders_pending_flow_assignment v
JOIN _diag_order d ON d.order_id = v.order_id;
