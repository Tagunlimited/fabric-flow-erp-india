-- Remove orders 187, 057, 124, 104, 120 from Cutting Manager (unassign cutting masters).
-- Matches TUC/26-27/187 style (last path segment) and plain numbers if present.

BEGIN;

CREATE TEMP TABLE _cutting_remove_targets ON COMMIT DROP AS
SELECT o.id, o.order_number
FROM public.orders o
WHERE COALESCE(o.is_deleted, false) = false
  AND (
    o.order_number ~ '/(187|057|124|104|120)$'
    OR o.order_number IN ('187', '057', '124', '104', '120')
  );

-- order_assignments: Cutting Manager loads rows where cutting_master_id IS NOT NULL
UPDATE public.order_assignments oa
SET
  cutting_master_id = NULL,
  cutting_master_name = NULL,
  cutting_work_date = NULL,
  updated_at = NOW()
FROM _cutting_remove_targets t
WHERE oa.order_id = t.id
  AND oa.cutting_master_id IS NOT NULL;

-- Multiple cutting masters per order (if used)
DELETE FROM public.order_cutting_assignments oca
USING _cutting_remove_targets t
WHERE oca.order_id = t.id;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM _cutting_remove_targets;
  RAISE NOTICE 'Cutting Manager unassign: % order(s) targeted (187, 057, 124, 104, 120)', v_count;
END $$;

COMMIT;
