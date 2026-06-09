-- Tailor payment report: effective assigned qty, legacy pick amount fallback, consistent per-size pay.

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
  effective_assigned AS (
    SELECT
      obsd.order_batch_assignment_id,
      GREATEST(
        COALESCE(obsd.assigned_quantity, 0),
        COALESCE(obsd.quantity, 0)
      )::bigint AS qty
    FROM public.order_batch_size_distributions obsd
  ),
  assigned_by_batch AS (
    SELECT oba.batch_id, SUM(ea.qty)::bigint AS assigned_total
    FROM oba
    JOIN effective_assigned ea ON ea.order_batch_assignment_id = oba.id
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
    SELECT oba.batch_id, SUM(ea.qty)::bigint AS d
    FROM oba
    JOIN effective_assigned ea ON ea.order_batch_assignment_id = oba.id
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
      COALESCE(
        oi.cutting_price_single_needle,
        oas.cutting_price_single_needle,
        oif.cutting_price_single_needle,
        0
      )::numeric AS sn,
      COALESCE(
        oi.cutting_price_overlock_flatlock,
        oas.cutting_price_overlock_flatlock,
        oif.cutting_price_overlock_flatlock,
        0
      )::numeric AS of_rate
    FROM oba
    LEFT JOIN line_uuid lu ON lu.oba_id = oba.id
    LEFT JOIN public.order_items oi ON oi.id = lu.order_item_id AND oi.order_id = oba.order_id
    LEFT JOIN LATERAL (
      SELECT x.cutting_price_single_needle, x.cutting_price_overlock_flatlock
      FROM public.order_assignments x
      WHERE x.order_id = oba.order_id
      ORDER BY x.updated_at DESC NULLS LAST, x.created_at DESC NULLS LAST
      LIMIT 1
    ) oas ON true
    LEFT JOIN LATERAL (
      SELECT it.cutting_price_single_needle, it.cutting_price_overlock_flatlock
      FROM public.order_items it
      WHERE it.order_id = oba.order_id
      ORDER BY
        CASE
          WHEN it.cutting_price_single_needle IS NOT NULL
            OR it.cutting_price_overlock_flatlock IS NOT NULL THEN 0
          ELSE 1
        END,
        it.quantity DESC NULLS LAST,
        it.created_at ASC NULLS LAST
      LIMIT 1
    ) oif ON true
  ),
  picked_in_range_by_size AS (
    SELECT e.order_batch_assignment_id, e.size_name, SUM(e.quantity_delta)::bigint AS d
    FROM public.order_batch_pick_events e
    WHERE e.picked_at >= p_ts_start AND e.picked_at <= p_ts_end
    GROUP BY e.order_batch_assignment_id, e.size_name
  ),
  pay_by_oba AS (
    SELECT
      oba.batch_id,
      SUM(
        COALESCE(
          NULLIF(COALESCE(pis.d, 0), 0),
          NULLIF(COALESCE(obsd.picked_quantity, 0), 0),
          0
        )::numeric * r.sn
      ) AS sn_amt,
      SUM(
        COALESCE(
          NULLIF(COALESCE(pis.d, 0), 0),
          NULLIF(COALESCE(obsd.picked_quantity, 0), 0),
          0
        )::numeric * r.of_rate
      ) AS of_amt
    FROM oba
    JOIN rates r ON r.oba_id = oba.id
    JOIN public.order_batch_size_distributions obsd ON obsd.order_batch_assignment_id = oba.id
    LEFT JOIN picked_in_range_by_size pis
      ON pis.order_batch_assignment_id = oba.id
      AND pis.size_name = obsd.size_name
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
      COALESCE(
        oi.cutting_price_single_needle,
        oas.cutting_price_single_needle,
        oif.cutting_price_single_needle,
        0
      )::numeric AS sn,
      COALESCE(
        oi.cutting_price_overlock_flatlock,
        oas.cutting_price_overlock_flatlock,
        oif.cutting_price_overlock_flatlock,
        0
      )::numeric AS of_rate
    FROM oba
    LEFT JOIN line_uuid lu ON lu.oba_id = oba.id
    LEFT JOIN public.order_items oi ON oi.id = lu.order_item_id AND oi.order_id = oba.order_id
    LEFT JOIN LATERAL (
      SELECT x.cutting_price_single_needle, x.cutting_price_overlock_flatlock
      FROM public.order_assignments x
      WHERE x.order_id = oba.order_id
      ORDER BY x.updated_at DESC NULLS LAST, x.created_at DESC NULLS LAST
      LIMIT 1
    ) oas ON true
    LEFT JOIN LATERAL (
      SELECT it.cutting_price_single_needle, it.cutting_price_overlock_flatlock
      FROM public.order_items it
      WHERE it.order_id = oba.order_id
      ORDER BY
        CASE
          WHEN it.cutting_price_single_needle IS NOT NULL
            OR it.cutting_price_overlock_flatlock IS NOT NULL THEN 0
          ELSE 1
        END,
        it.quantity DESC NULLS LAST,
        it.created_at ASC NULLS LAST
      LIMIT 1
    ) oif ON true
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
    GREATEST(
      COALESCE(obsd.assigned_quantity, 0),
      COALESCE(obsd.quantity, 0)
    )::integer AS assigned_quantity,
    obsd.picked_quantity,
    COALESCE(ev.d, 0)::bigint AS picked_in_range,
    r.sn AS sn_rate_per_pc,
    r.of_rate AS of_rate_per_pc,
    ROUND(
      COALESCE(
        NULLIF(COALESCE(ev.d, 0), 0),
        NULLIF(COALESCE(obsd.picked_quantity, 0), 0),
        0
      )::numeric * r.sn,
      2
    ) AS sn_line_amount,
    ROUND(
      COALESCE(
        NULLIF(COALESCE(ev.d, 0), 0),
        NULLIF(COALESCE(obsd.picked_quantity, 0), 0),
        0
      )::numeric * r.of_rate,
      2
    ) AS of_line_amount,
    oba.notes
  FROM oba
  JOIN public.orders o ON o.id = oba.order_id
  JOIN public.order_batch_size_distributions obsd ON obsd.order_batch_assignment_id = oba.id
  JOIN rates r ON r.oba_id = oba.id
  LEFT JOIN ev ON ev.order_batch_assignment_id = oba.id AND ev.size_name = obsd.size_name
  ORDER BY o.order_number, oba.id, obsd.size_name;
$$;

COMMENT ON FUNCTION public.tailor_payment_batch_summary(date, date, timestamptz, timestamptz) IS
  'Batch-level tailor payment metrics; assigned uses max(assigned_quantity, quantity); pay uses in-range picks or legacy picked_quantity when no ledger events.';

COMMENT ON FUNCTION public.tailor_payment_batch_detail(uuid, timestamptz, timestamptz) IS
  'Per assignment × size drill-down; sizes sorted in UI; assigned and SN/OF amounts use same effective qty rules as summary.';

GRANT EXECUTE ON FUNCTION public.tailor_payment_batch_summary(date, date, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tailor_payment_batch_detail(uuid, timestamptz, timestamptz) TO authenticated;
