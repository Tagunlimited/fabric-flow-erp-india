-- Backfill assigned_quantity from legacy quantity and fix details view resolution.
-- assigned_quantity defaults to 0, so COALESCE(assigned_quantity, quantity) ignored quantity when assigned_quantity=0.

BEGIN;

UPDATE public.order_batch_size_distributions
SET assigned_quantity = GREATEST(COALESCE(assigned_quantity, 0), COALESCE(quantity, 0))
WHERE COALESCE(quantity, 0) > COALESCE(assigned_quantity, 0);

UPDATE public.order_batch_assignments oba
SET total_quantity = sub.sum_qty
FROM (
  SELECT
    order_batch_assignment_id,
    SUM(GREATEST(COALESCE(assigned_quantity, 0), COALESCE(quantity, 0))) AS sum_qty
  FROM public.order_batch_size_distributions
  GROUP BY order_batch_assignment_id
) sub
WHERE oba.id = sub.order_batch_assignment_id;

DO $$
DECLARE
  v_assigned_value_expr text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_batch_size_distributions'
      AND column_name = 'quantity'
  ) THEN
    v_assigned_value_expr :=
      'greatest(coalesce(obsd.assigned_quantity, 0), coalesce(obsd.quantity, 0))';
  ELSE
    v_assigned_value_expr := 'coalesce(obsd.assigned_quantity, 0)';
  END IF;

  EXECUTE 'drop view if exists public.order_batch_assignments_with_details';

  EXECUTE format($view$
    create view public.order_batch_assignments_with_details as
    select
      oba.id,
      oba.id as assignment_id,
      oba.order_id,
      oba.batch_id,
      oba.assigned_by_id,
      oba.assigned_by_name,
      oba.assignment_date,
      oba.status,
      oba.notes,
      oba.created_at,
      oba.updated_at,
      b.batch_name,
      b.batch_code,
      b.tailor_type,
      b.max_capacity,
      b.current_capacity,
      b.batch_leader_id,
      b.batch_leader_name,
      b.batch_leader_avatar_url,
      b.location,
      b.department,
      b.specialization,
      b.hourly_rate,
      b.efficiency_rating as batch_efficiency_rating,
      b.quality_rating as batch_quality_rating,
      b.status as batch_status,
      b.is_active as batch_is_active,
      coalesce(sum(%1$s), 0) as total_quantity,
      coalesce(sum(obsd.picked_quantity), 0) as total_picked_quantity,
      coalesce(
        json_agg(
          json_build_object(
            'size_name', obsd.size_name,
            'assigned_quantity', %1$s,
            'quantity', %1$s,
            'picked_quantity', coalesce(obsd.picked_quantity, 0),
            'completed_quantity', coalesce(obsd.completed_quantity, 0)
          ) order by obsd.size_name
        ) filter (where obsd.id is not null),
        '[]'::json
      ) as size_distributions
    from public.order_batch_assignments oba
    left join public.batches b on oba.batch_id = b.id
    left join public.order_batch_size_distributions obsd on oba.id = obsd.order_batch_assignment_id
    group by
      oba.id,
      oba.order_id,
      oba.batch_id,
      oba.assigned_by_id,
      oba.assigned_by_name,
      oba.assignment_date,
      oba.status,
      oba.notes,
      oba.created_at,
      oba.updated_at,
      b.batch_name,
      b.batch_code,
      b.tailor_type,
      b.max_capacity,
      b.current_capacity,
      b.batch_leader_id,
      b.batch_leader_name,
      b.batch_leader_avatar_url,
      b.location,
      b.department,
      b.specialization,
      b.hourly_rate,
      b.efficiency_rating,
      b.quality_rating,
      b.status,
      b.is_active
  $view$, v_assigned_value_expr);
END $$;

COMMIT;
