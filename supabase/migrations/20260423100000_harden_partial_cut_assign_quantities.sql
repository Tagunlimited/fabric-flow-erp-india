-- Harden partial cut/assign quantity integrity and normalize SQL usage.
-- This migration is additive and compatibility-safe across quantity/assigned_quantity variants.

BEGIN;

-- 1) Ensure canonical quantity column exists and has data.
ALTER TABLE IF EXISTS public.order_batch_size_distributions
  ADD COLUMN IF NOT EXISTS assigned_quantity integer;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_batch_size_distributions'
      AND column_name = 'quantity'
  ) THEN
    EXECUTE '
      UPDATE public.order_batch_size_distributions
      SET assigned_quantity = COALESCE(assigned_quantity, quantity, 0)
      WHERE assigned_quantity IS NULL
    ';
  ELSE
    EXECUTE '
      UPDATE public.order_batch_size_distributions
      SET assigned_quantity = COALESCE(assigned_quantity, 0)
      WHERE assigned_quantity IS NULL
    ';
  END IF;
END $$;

ALTER TABLE IF EXISTS public.order_batch_size_distributions
  ALTER COLUMN assigned_quantity SET DEFAULT 0;

-- 2) Non-negative and bounded quantity constraints.
ALTER TABLE IF EXISTS public.order_cutting_assignments
  ALTER COLUMN assigned_quantity SET DEFAULT 0,
  ALTER COLUMN completed_quantity SET DEFAULT 0;

UPDATE public.order_cutting_assignments
SET assigned_quantity = COALESCE(assigned_quantity, 0),
    completed_quantity = COALESCE(completed_quantity, 0)
WHERE assigned_quantity IS NULL OR completed_quantity IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_cutting_assignments_non_negative'
  ) THEN
    ALTER TABLE public.order_cutting_assignments
      ADD CONSTRAINT chk_order_cutting_assignments_non_negative
      CHECK (
        COALESCE(assigned_quantity, 0) >= 0
        AND COALESCE(completed_quantity, 0) >= 0
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_cutting_assignments_completed_le_assigned'
  ) THEN
    ALTER TABLE public.order_cutting_assignments
      ADD CONSTRAINT chk_order_cutting_assignments_completed_le_assigned
      CHECK (
        COALESCE(completed_quantity, 0) <= COALESCE(assigned_quantity, 0)
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_batch_assignments_non_negative'
  ) THEN
    ALTER TABLE public.order_batch_assignments
      ADD CONSTRAINT chk_order_batch_assignments_non_negative
      CHECK (
        COALESCE(total_quantity, 0) >= 0
        AND COALESCE(completed_quantity, 0) >= 0
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_batch_assignments_completed_le_total'
  ) THEN
    ALTER TABLE public.order_batch_assignments
      ADD CONSTRAINT chk_order_batch_assignments_completed_le_total
      CHECK (
        COALESCE(completed_quantity, 0) <= COALESCE(total_quantity, 0)
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_batch_size_dist_non_negative'
  ) THEN
    ALTER TABLE public.order_batch_size_distributions
      ADD CONSTRAINT chk_order_batch_size_dist_non_negative
      CHECK (
        COALESCE(assigned_quantity, 0) >= 0
        AND COALESCE(picked_quantity, 0) >= 0
        AND COALESCE(completed_quantity, 0) >= 0
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_batch_size_dist_picked_le_assigned'
  ) THEN
    ALTER TABLE public.order_batch_size_distributions
      ADD CONSTRAINT chk_order_batch_size_dist_picked_le_assigned
      CHECK (
        COALESCE(picked_quantity, 0) <= COALESCE(assigned_quantity, 0)
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_batch_size_dist_completed_le_assigned'
  ) THEN
    ALTER TABLE public.order_batch_size_distributions
      ADD CONSTRAINT chk_order_batch_size_dist_completed_le_assigned
      CHECK (
        COALESCE(completed_quantity, 0) <= COALESCE(assigned_quantity, 0)
      ) NOT VALID;
  END IF;
END $$;

-- 3) Unique key and helper index for size distributions.
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_batch_size_dist_assignment_size
  ON public.order_batch_size_distributions(order_batch_assignment_id, size_name);

CREATE INDEX IF NOT EXISTS idx_order_batch_size_dist_size_name
  ON public.order_batch_size_distributions(size_name);

-- 4) Canonical recalc function: choose assigned expression based on schema.
DO $$
DECLARE
  v_assigned_expr text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_batch_size_distributions'
      AND column_name = 'quantity'
  ) THEN
    v_assigned_expr := 'coalesce(sum(coalesce(obsd.assigned_quantity, obsd.quantity, 0)),0)';
  ELSE
    v_assigned_expr := 'coalesce(sum(coalesce(obsd.assigned_quantity, 0)),0)';
  END IF;

  EXECUTE format($fn$
    create or replace function public.recalc_order_status(p_order_id uuid)
    returns void
    language plpgsql
    as $body$
    declare
      v_current public.order_status;
      v_target public.order_status;
      v_order_number text;
      v_has_receipt boolean := false;
      v_item_count integer := 0;
      v_done_count integer := 0;
      v_has_bom boolean := false;
      v_has_cutting boolean := false;
      v_has_batch boolean := false;
      v_total_assigned integer := 0;
      v_total_picked integer := 0;
      v_total_approved integer := 0;
      v_total_rejected integer := 0;
      v_total_dispatched integer := 0;
    begin
      if p_order_id is null then return; end if;

      select o.status, o.order_number into v_current, v_order_number from public.orders o where o.id = p_order_id;
      if v_current is null then return; end if;
      if v_current = 'cancelled' then return; end if;

      select exists(
               select 1 from public.receipts r
               where (lower(coalesce(r.reference_type,''))='order' and r.reference_id = p_order_id)
                  or (r.reference_number is not null and r.reference_number = v_order_number)
             ) into v_has_receipt;

      select count(*) into v_item_count from public.order_items oi where oi.order_id = p_order_id;
      select count(*) into v_done_count from public.order_items oi
       where oi.order_id = p_order_id
         and jsonb_array_length(coalesce(oi.specifications->'mockup_images','[]'::jsonb))>0
         and jsonb_array_length(coalesce(oi.specifications->'reference_images','[]'::jsonb))>0;

      select exists(select 1 from public.bom_records br where br.order_id = p_order_id) into v_has_bom;

      select exists(
               select 1 from public.order_assignments oa
               where oa.order_id = p_order_id and (oa.cutting_master_id is not null or oa.pattern_master_id is not null)
             )
             or exists(
               select 1 from public.order_cutting_assignments oca
               where oca.order_id = p_order_id and oca.cutting_master_id is not null
             )
        into v_has_cutting;

      select exists(
               select 1 from public.order_batch_assignments oba where oba.order_id = p_order_id
             ) into v_has_batch;

      select %1$s into v_total_assigned
        from public.order_batch_size_distributions obsd
        join public.order_batch_assignments oba on oba.id = obsd.order_batch_assignment_id
       where oba.order_id = p_order_id;

      select coalesce(sum(obsd.picked_quantity),0) into v_total_picked
        from public.order_batch_size_distributions obsd
        join public.order_batch_assignments oba on oba.id = obsd.order_batch_assignment_id
       where oba.order_id = p_order_id;

      select coalesce(sum(qr.approved_quantity),0), coalesce(sum(qr.rejected_quantity),0)
        into v_total_approved, v_total_rejected
        from public.qc_reviews qr
        join public.order_batch_assignments oba on oba.id = qr.order_batch_assignment_id
       where oba.order_id = p_order_id;

      select coalesce(sum(doi.quantity),0)
        into v_total_dispatched
        from public.dispatch_order_items doi
       where doi.order_id = p_order_id;

      v_target := 'pending';

      if v_item_count > 0 and v_done_count = v_item_count then
        v_target := 'designing_done';
      end if;

      if v_has_receipt then
        v_target := 'confirmed';
      end if;

      if v_has_bom then
        v_target := 'under_procurement';
      end if;

      if v_has_cutting then
        v_target := 'under_cutting';
      end if;

      if v_has_batch then
        v_target := 'under_stitching';
      end if;

      if v_total_picked > 0 then
        v_target := 'under_qc';
      end if;

      if v_total_approved > 0 and v_total_approved >= greatest(v_total_picked - v_total_rejected, 1) then
        v_target := 'ready_for_dispatch';
      end if;

      if v_total_rejected > 0 then
        v_target := 'rework';
      end if;

      if v_total_dispatched > 0 and v_total_dispatched < greatest(v_total_approved - v_total_rejected, 1) then
        v_target := 'partial_dispatched';
      end if;

      if v_total_dispatched >= greatest(v_total_approved - v_total_rejected, 1) and v_total_approved > 0 then
        v_target := 'dispatched';
      end if;

      if v_current in ('completed') then return; end if;

      if v_target is distinct from v_current then
        update public.orders set status = v_target, updated_at = now() where id = p_order_id;
      end if;
    end;
    $body$;
  $fn$, v_assigned_expr);
END $$;

-- 5) Canonical details view: expose assigned quantity from canonical column.
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
    v_assigned_value_expr := 'coalesce(obsd.assigned_quantity, obsd.quantity, 0)';
  ELSE
    v_assigned_value_expr := 'coalesce(obsd.assigned_quantity, 0)';
  END IF;

  -- Recreate view explicitly (not CREATE OR REPLACE) to avoid
  -- "cannot drop columns from view" on environments with older shape.
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
