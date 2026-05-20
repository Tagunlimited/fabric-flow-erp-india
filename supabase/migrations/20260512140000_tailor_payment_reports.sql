-- Tailor payment reports: pick event ledger (no historical backfill before this migration),
-- batch approvals, and RPCs for batch-level summaries and line/size detail.
-- Ledger semantics: quantity_delta is the change to picked_quantity (picker positive, QC negative).

ALTER TABLE public.order_batch_assignments
  ADD COLUMN IF NOT EXISTS assignment_date date;

CREATE TABLE IF NOT EXISTS public.order_batch_pick_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_batch_assignment_id uuid NOT NULL REFERENCES public.order_batch_assignments(id) ON DELETE CASCADE,
  size_name text NOT NULL,
  quantity_delta integer NOT NULL,
  picked_at timestamptz NOT NULL DEFAULT now(),
  picked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'picker_dialog',
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.order_batch_pick_events IS
  'Append-only deltas for garment picked_quantity. Period reports use picked_at; rows exist only from app instrumentation go-live — pre-migration picks have no events.';

CREATE INDEX IF NOT EXISTS idx_order_batch_pick_events_assignment
  ON public.order_batch_pick_events(order_batch_assignment_id);

CREATE INDEX IF NOT EXISTS idx_order_batch_pick_events_picked_at
  ON public.order_batch_pick_events(picked_at);

CREATE INDEX IF NOT EXISTS idx_order_batch_pick_events_assignment_picked_at
  ON public.order_batch_pick_events(order_batch_assignment_id, picked_at);

ALTER TABLE public.order_batch_pick_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated manage order_batch_pick_events" ON public.order_batch_pick_events;
CREATE POLICY "authenticated manage order_batch_pick_events" ON public.order_batch_pick_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.tailor_payment_batch_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  snapshot_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending_approval', 'approved')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tailor_payment_batch_approvals_period_order CHECK (period_end >= period_start),
  CONSTRAINT tailor_payment_batch_approvals_batch_period_unique UNIQUE (batch_id, period_start, period_end)
);

COMMENT ON TABLE public.tailor_payment_batch_approvals IS
  'Frozen batch-level tailor payment review for a calendar period; one row per (batch, period).';

CREATE INDEX IF NOT EXISTS idx_tailor_payment_batch_approvals_batch ON public.tailor_payment_batch_approvals(batch_id);

ALTER TABLE public.tailor_payment_batch_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated manage tailor_payment_batch_approvals" ON public.tailor_payment_batch_approvals;
CREATE POLICY "authenticated manage tailor_payment_batch_approvals" ON public.tailor_payment_batch_approvals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- tailor_payment_batch_summary: batch-level aggregates
-- p_period_start / p_period_end: inclusive calendar dates (UI selection) for
--   assigned-in-range and approval row matching.
-- p_ts_start / p_ts_end: inclusive timestamptz bounds for pick-event sums.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tailor_payment_batch_summary(
  p_period_start date,
  p_period_end date,
  p_ts_start timestamptz,
  p_ts_end timestamptz
)
RETURNS TABLE (
  batch_id uuid,
  batch_name text,
  opening_pending bigint,
  assigned_in_range bigint,
  picked_in_range bigint,
  sn_amount numeric,
  of_amount numeric,
  total_payable numeric,
  approval_status text
)
LANGUAGE sql
STABLE
AS $$
  WITH oba AS (
    SELECT
      oba.id,
      oba.batch_id,
      oba.order_id,
      oba.notes,
      COALESCE(oba.assignment_date, oba.created_at::date) AS assign_day
    FROM public.order_batch_assignments oba
    WHERE oba.batch_id IS NOT NULL
  ),
  assigned_by_batch AS (
    SELECT oba.batch_id, SUM(obsd.assigned_quantity)::bigint AS assigned_total
    FROM oba
    JOIN public.order_batch_size_distributions obsd ON obsd.order_batch_assignment_id = oba.id
    GROUP BY oba.batch_id
  ),
  picked_by_batch AS (
    SELECT oba.batch_id, SUM(obsd.picked_quantity)::bigint AS picked_total
    FROM oba
    JOIN public.order_batch_size_distributions obsd ON obsd.order_batch_assignment_id = oba.id
    GROUP BY oba.batch_id
  ),
  events_in AS (
    SELECT oba.batch_id, SUM(e.quantity_delta)::bigint AS d
    FROM public.order_batch_pick_events e
    JOIN oba ON oba.id = e.order_batch_assignment_id
    WHERE e.picked_at >= p_ts_start AND e.picked_at <= p_ts_end
    GROUP BY oba.batch_id
  ),
  events_after AS (
    SELECT oba.batch_id, SUM(e.quantity_delta)::bigint AS d
    FROM public.order_batch_pick_events e
    JOIN oba ON oba.id = e.order_batch_assignment_id
    WHERE e.picked_at > p_ts_end
    GROUP BY oba.batch_id
  ),
  assigned_new_in_range AS (
    SELECT oba.batch_id, SUM(obsd.assigned_quantity)::bigint AS d
    FROM oba
    JOIN public.order_batch_size_distributions obsd ON obsd.order_batch_assignment_id = oba.id
    WHERE oba.assign_day >= p_period_start
      AND oba.assign_day <= p_period_end
    GROUP BY oba.batch_id
  ),
  line_uuid AS (
    SELECT
      oba.id AS oba_id,
      oba.batch_id,
      CASE
        WHEN oba.notes IS NOT NULL AND oba.notes ~* '\[line:[0-9a-f-]{36}\]'
        THEN (regexp_match(oba.notes, '\[line:([0-9a-f-]{36})\]', 'i'))[1]::uuid
        ELSE NULL
      END AS order_item_id
    FROM oba
  ),
  rates AS (
    SELECT
      oba.id AS oba_id,
      oba.batch_id,
      COALESCE(oi.cutting_price_single_needle, oas.cutting_price_single_needle, 0)::numeric AS sn,
      COALESCE(oi.cutting_price_overlock_flatlock, oas.cutting_price_overlock_flatlock, 0)::numeric AS of_rate
    FROM oba
    LEFT JOIN public.order_assignments oas ON oas.order_id = oba.order_id
    LEFT JOIN line_uuid lu ON lu.oba_id = oba.id
    LEFT JOIN public.order_items oi ON oi.id = lu.order_item_id AND oi.order_id = oba.order_id
  ),
  picked_in_range_by_oba AS (
    SELECT e.order_batch_assignment_id, SUM(e.quantity_delta)::bigint AS d
    FROM public.order_batch_pick_events e
    WHERE e.picked_at >= p_ts_start AND e.picked_at <= p_ts_end
    GROUP BY e.order_batch_assignment_id
  ),
  pay_by_oba AS (
    SELECT
      oba.batch_id,
      SUM(COALESCE(pi.d, 0)::numeric * r.sn) AS sn_amt,
      SUM(COALESCE(pi.d, 0)::numeric * r.of_rate) AS of_amt
    FROM oba
    JOIN rates r ON r.oba_id = oba.id
    LEFT JOIN picked_in_range_by_oba pi ON pi.order_batch_assignment_id = oba.id
    GROUP BY oba.batch_id
  )
  SELECT
    b.id AS batch_id,
    COALESCE(NULLIF(trim(b.batch_name), ''), b.batch_code, b.id::text) AS batch_name,
    GREATEST(
      0,
      COALESCE(ab.assigned_total, 0)
        - COALESCE(pb.picked_total, 0)
        + COALESCE(ei.d, 0)
        + COALESCE(ea.d, 0)
    )::bigint AS opening_pending,
    COALESCE(an.d, 0)::bigint AS assigned_in_range,
    COALESCE(ei.d, 0)::bigint AS picked_in_range,
    ROUND(COALESCE(py.sn_amt, 0), 2) AS sn_amount,
    ROUND(COALESCE(py.of_amt, 0), 2) AS of_amount,
    ROUND(COALESCE(py.sn_amt, 0) + COALESCE(py.of_amt, 0), 2) AS total_payable,
    CASE
      WHEN ap.id IS NOT NULL THEN ap.status
      ELSE 'draft'
    END::text AS approval_status
  FROM public.batches b
  LEFT JOIN assigned_by_batch ab ON ab.batch_id = b.id
  LEFT JOIN picked_by_batch pb ON pb.batch_id = b.id
  LEFT JOIN events_in ei ON ei.batch_id = b.id
  LEFT JOIN events_after ea ON ea.batch_id = b.id
  LEFT JOIN assigned_new_in_range an ON an.batch_id = b.id
  LEFT JOIN pay_by_oba py ON py.batch_id = b.id
  LEFT JOIN public.tailor_payment_batch_approvals ap
    ON ap.batch_id = b.id
    AND ap.period_start = p_period_start
    AND ap.period_end = p_period_end
  WHERE EXISTS (SELECT 1 FROM oba WHERE oba.batch_id = b.id)
  ORDER BY batch_name;
$$;

COMMENT ON FUNCTION public.tailor_payment_batch_summary(date, date, timestamptz, timestamptz) IS
  'Batch-level tailor payment metrics; opening_pending uses current assigned/pick totals adjusted by pick-event ledger outside the range.';

GRANT EXECUTE ON FUNCTION public.tailor_payment_batch_summary(date, date, timestamptz, timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- tailor_payment_batch_detail: per assignment × size for drill-down
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tailor_payment_batch_detail(
  p_batch_id uuid,
  p_ts_start timestamptz,
  p_ts_end timestamptz
)
RETURNS TABLE (
  order_batch_assignment_id uuid,
  order_id uuid,
  order_number text,
  size_name text,
  assigned_quantity integer,
  picked_quantity integer,
  picked_in_range bigint,
  sn_rate_per_pc numeric,
  of_rate_per_pc numeric,
  sn_line_amount numeric,
  of_line_amount numeric,
  notes text
)
LANGUAGE sql
STABLE
AS $$
  WITH oba AS (
    SELECT *
    FROM public.order_batch_assignments oba
    WHERE oba.batch_id = p_batch_id
  ),
  line_uuid AS (
    SELECT
      oba.id AS oba_id,
      CASE
        WHEN oba.notes IS NOT NULL AND oba.notes ~* '\[line:[0-9a-f-]{36}\]'
        THEN (regexp_match(oba.notes, '\[line:([0-9a-f-]{36})\]', 'i'))[1]::uuid
        ELSE NULL
      END AS order_item_id
    FROM oba
  ),
  rates AS (
    SELECT
      oba.id AS oba_id,
      COALESCE(oi.cutting_price_single_needle, oas.cutting_price_single_needle, 0)::numeric AS sn,
      COALESCE(oi.cutting_price_overlock_flatlock, oas.cutting_price_overlock_flatlock, 0)::numeric AS of_rate
    FROM oba
    LEFT JOIN public.order_assignments oas ON oas.order_id = oba.order_id
    LEFT JOIN line_uuid lu ON lu.oba_id = oba.id
    LEFT JOIN public.order_items oi ON oi.id = lu.order_item_id AND oi.order_id = oba.order_id
  ),
  ev AS (
    SELECT e.order_batch_assignment_id, e.size_name, SUM(e.quantity_delta)::bigint AS d
    FROM public.order_batch_pick_events e
    WHERE e.picked_at >= p_ts_start AND e.picked_at <= p_ts_end
    GROUP BY e.order_batch_assignment_id, e.size_name
  )
  SELECT
    oba.id AS order_batch_assignment_id,
    oba.order_id,
    o.order_number,
    obsd.size_name,
    obsd.assigned_quantity,
    obsd.picked_quantity,
    COALESCE(ev.d, 0)::bigint AS picked_in_range,
    r.sn AS sn_rate_per_pc,
    r.of_rate AS of_rate_per_pc,
    ROUND(COALESCE(ev.d, 0)::numeric * r.sn, 2) AS sn_line_amount,
    ROUND(COALESCE(ev.d, 0)::numeric * r.of_rate, 2) AS of_line_amount,
    oba.notes
  FROM oba
  JOIN public.orders o ON o.id = oba.order_id
  JOIN public.order_batch_size_distributions obsd ON obsd.order_batch_assignment_id = oba.id
  JOIN rates r ON r.oba_id = oba.id
  LEFT JOIN ev ON ev.order_batch_assignment_id = oba.id AND ev.size_name = obsd.size_name
  ORDER BY o.order_number, oba.id, obsd.size_name;
$$;

GRANT EXECUTE ON FUNCTION public.tailor_payment_batch_detail(uuid, timestamptz, timestamptz) TO authenticated;
