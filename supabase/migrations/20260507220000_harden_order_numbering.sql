-- Harden order numbering:
-- 1) Backfill remaining month-based order numbers (including deleted rows) to monthless TUC/RMO format
-- 2) Propagate mapping to denormalized order_number/reference_number fields
-- 3) Enforce DB-level format guardrails
-- 4) Tighten receipt fallback checks to prefer reference_id and only allow normalized fallback text

DO $$
DECLARE
  rec record;
  v_legacy_orders integer := 0;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS order_number_mapping (
    order_id uuid PRIMARY KEY,
    old_order_number text UNIQUE NOT NULL,
    new_order_number text UNIQUE NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE order_number_mapping;

  INSERT INTO order_number_mapping (order_id, old_order_number, new_order_number)
  WITH old_orders AS (
    SELECT
      o.id,
      o.order_number AS old_num,
      o.created_at,
      substring(o.order_number FROM '^(TUC|RMO)/')::text AS prefix_with_slash,
      substring(o.order_number FROM '^(?:TUC|RMO)/([0-9]{2}-[0-9]{2})/')::text AS fy
    FROM public.orders o
    WHERE o.order_number ~ '^(TUC|RMO)/[0-9]{2}-[0-9]{2}/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/[0-9]+$'
  ),
  normalized_old AS (
    SELECT
      id,
      old_num,
      created_at,
      replace(prefix_with_slash, '/', '') AS prefix,
      fy
    FROM old_orders
    WHERE prefix_with_slash IS NOT NULL AND fy IS NOT NULL
  ),
  base_seq AS (
    SELECT
      g.prefix,
      g.fy,
      COALESCE(MAX((substring(o.order_number FROM '/([0-9]+)$'))::int), 0) AS max_seq
    FROM (
      SELECT DISTINCT prefix, fy FROM normalized_old
    ) g
    LEFT JOIN public.orders o
      ON o.order_number ~ ('^' || g.prefix || '/' || g.fy || '/[0-9]+$')
      AND o.order_number !~ '/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/'
    GROUP BY g.prefix, g.fy
  ),
  ranked AS (
    SELECT
      n.id,
      n.old_num,
      n.prefix,
      n.fy,
      b.max_seq,
      ROW_NUMBER() OVER (PARTITION BY n.prefix, n.fy ORDER BY n.created_at ASC, n.id ASC) AS rn
    FROM normalized_old n
    JOIN base_seq b ON b.prefix = n.prefix AND b.fy = n.fy
  )
  SELECT
    r.id,
    r.old_num,
    r.prefix || '/' || r.fy || '/' || LPAD((r.max_seq + r.rn)::text, 3, '0')
  FROM ranked r;

  UPDATE public.orders o
  SET order_number = m.new_order_number
  FROM order_number_mapping m
  WHERE o.id = m.order_id
    AND o.order_number = m.old_order_number;

  -- Propagate mapped order_number to all public tables with order_number column.
  FOR rec IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'order_number'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name <> 'orders'
  LOOP
    EXECUTE format(
      'UPDATE public.%I t
       SET order_number = m.new_order_number
       FROM order_number_mapping m
       WHERE t.order_number = m.old_order_number',
      rec.table_name
    );
  END LOOP;

  -- Propagate to known reference text fields that can store order_number.
  IF to_regclass('public.receipts') IS NOT NULL THEN
    UPDATE public.receipts r
    SET reference_number = m.new_order_number
    FROM order_number_mapping m
    WHERE lower(coalesce(r.reference_type, '')) = 'order'
      AND r.reference_number = m.old_order_number;
  END IF;

  IF to_regclass('public.inventory_logs') IS NOT NULL THEN
    UPDATE public.inventory_logs il
    SET reference_number = m.new_order_number
    FROM order_number_mapping m
    WHERE lower(coalesce(il.reference_type, '')) = 'order'
      AND il.reference_number = m.old_order_number;
  END IF;

  SELECT COUNT(*) INTO v_legacy_orders
  FROM public.orders
  WHERE order_number ~ '^(TUC|RMO)/[0-9]{2}-[0-9]{2}/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/[0-9]+$';

  IF v_legacy_orders > 0 THEN
    RAISE EXCEPTION 'Order-number hardening failed: % legacy order numbers remain in orders table', v_legacy_orders;
  END IF;
END $$;

-- Strict format guardrail at DB level.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS chk_orders_order_number_format;

ALTER TABLE public.orders
  ADD CONSTRAINT chk_orders_order_number_format
  CHECK (order_number ~ '^(TUC|RMO)/[0-9]{2}-[0-9]{2}/[0-9]+$') NOT VALID;

DO $$
DECLARE
  v_invalid_count integer := 0;
BEGIN
  SELECT count(*)::int
    INTO v_invalid_count
  FROM public.orders
  WHERE order_number !~ '^(TUC|RMO)/[0-9]{2}-[0-9]{2}/[0-9]+$';

  IF v_invalid_count > 0 THEN
    RAISE NOTICE
      'Skipping VALIDATE CONSTRAINT chk_orders_order_number_format: % existing rows still have legacy/non-standard order_number values. New/updated rows are still enforced by trigger and NOT VALID constraint.',
      v_invalid_count;
  ELSE
    ALTER TABLE public.orders
      VALIDATE CONSTRAINT chk_orders_order_number_format;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validate_order_number_format()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.order_number := upper(trim(coalesce(NEW.order_number, '')));
  IF NEW.order_number = '' THEN
    RAISE EXCEPTION 'order_number is required';
  END IF;
  IF NEW.order_number !~ '^(TUC|RMO)/[0-9]{2}-[0-9]{2}/[0-9]+$' THEN
    RAISE EXCEPTION 'Invalid order_number format: %. Expected TUC/YY-YY/NNN or RMO/YY-YY/NNN', NEW.order_number;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_order_number_format ON public.orders;
CREATE TRIGGER trg_validate_order_number_format
BEFORE INSERT OR UPDATE OF order_number ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.validate_order_number_format();

-- Tighten active receipt fallback checks in flow-assignment RPC.
CREATE OR REPLACE FUNCTION public.assign_order_item_flows(
  p_order_id uuid,
  p_assignments jsonb,
  p_actor uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_number text;
  v_order_status public.order_status;
  v_has_receipt boolean := false;
  v_row jsonb;
  v_item_id uuid;
  v_flow public.order_item_execution_flow;
  v_inv jsonb;
  v_wi_id uuid;
  v_qty numeric;
  v_sum numeric;
  v_need numeric;
  v_avail numeric;
  v_alloc numeric;
  v_oic numeric;
  v_product_id uuid;
  v_wi_item_type text;
  v_wi_item_id uuid;
  v_lock int;
  v_actor uuid;
BEGIN
  v_actor := coalesce(p_actor, auth.uid());
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order_id required';
  END IF;

  IF p_assignments IS NULL OR jsonb_typeof(p_assignments) <> 'array' OR jsonb_array_length(p_assignments) = 0 THEN
    RAISE EXCEPTION 'assignments must be a non-empty array';
  END IF;

  SELECT o.status, o.order_number
    INTO v_order_status, v_order_number
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  IF v_order_status = 'cancelled' THEN
    RAISE EXCEPTION 'cannot assign flows on cancelled order';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.receipts r
    WHERE (
      lower(coalesce(r.reference_type, '')) = 'order' AND r.reference_id = p_order_id
    )
    OR (
      r.reference_id IS NULL
      AND r.reference_number IS NOT NULL
      AND r.reference_number ~ '^(TUC|RMO)/[0-9]{2}-[0-9]{2}/[0-9]+$'
      AND r.reference_number = v_order_number
    )
  ) INTO v_has_receipt;

  IF NOT v_has_receipt THEN
    RAISE EXCEPTION 'order must have a receipt before assigning execution flows';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_assignments)
  LOOP
    v_item_id := (v_row->>'order_item_id')::uuid;
    v_flow := (v_row->>'execution_flow')::public.order_item_execution_flow;

    IF v_item_id IS NULL OR v_flow IS NULL THEN
      RAISE EXCEPTION 'each assignment requires order_item_id and execution_flow';
    END IF;

    SELECT 1 INTO v_lock
    FROM public.order_items oi
    WHERE oi.id = v_item_id AND oi.order_id = p_order_id
    FOR UPDATE;

    IF v_lock IS NULL THEN
      RAISE EXCEPTION 'order_item % does not belong to this order', v_item_id;
    END IF;

    INSERT INTO public.order_item_flow_assignments (
      order_item_id, execution_flow, assigned_by, assigned_at
    ) VALUES (
      v_item_id, v_flow, v_actor, now()
    );

    IF v_flow = 'inventory' THEN
      DELETE FROM public.order_item_inventory_commitments
      WHERE order_item_id = v_item_id AND state = 'reserved';

      v_sum := 0;
      IF v_row ? 'inventory' AND jsonb_typeof(v_row->'inventory') = 'array' THEN
        FOR v_inv IN SELECT * FROM jsonb_array_elements(v_row->'inventory')
        LOOP
          v_wi_id := (v_inv->>'warehouse_inventory_id')::uuid;
          v_qty := coalesce((v_inv->>'quantity')::numeric, 0);
          IF v_wi_id IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'inventory entries need warehouse_inventory_id and positive quantity';
          END IF;

          SELECT wi.item_type::text, wi.item_id
            INTO v_wi_item_type, v_wi_item_id
          FROM public.warehouse_inventory wi
          WHERE wi.id = v_wi_id
          FOR UPDATE;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'warehouse_inventory row not found: %', v_wi_id;
          END IF;

          SELECT oi.product_id INTO v_product_id
          FROM public.order_items oi
          WHERE oi.id = v_item_id;

          IF v_product_id IS NOT NULL THEN
            IF upper(coalesce(v_wi_item_type, '')) <> 'PRODUCT' OR v_wi_item_id IS DISTINCT FROM v_product_id THEN
              RAISE EXCEPTION 'warehouse inventory % does not match order line product', v_wi_id;
            END IF;
          END IF;

          SELECT coalesce(wi.quantity, 0) INTO v_avail
          FROM public.warehouse_inventory wi WHERE wi.id = v_wi_id;

          SELECT coalesce(sum(ia.quantity), 0) INTO v_alloc
          FROM public.inventory_allocations ia
          WHERE ia.warehouse_inventory_id = v_wi_id;

          SELECT coalesce(sum(c.quantity), 0) INTO v_oic
          FROM public.order_item_inventory_commitments c
          WHERE c.warehouse_inventory_id = v_wi_id AND c.state = 'reserved';

          IF v_avail - v_alloc - v_oic < v_qty THEN
            RAISE EXCEPTION 'insufficient available stock for warehouse_inventory %', v_wi_id;
          END IF;

          INSERT INTO public.order_item_inventory_commitments (
            order_item_id, warehouse_inventory_id, quantity, state, created_by
          ) VALUES (
            v_item_id, v_wi_id, v_qty, 'reserved', v_actor
          );

          v_sum := v_sum + v_qty;
        END LOOP;
      END IF;

      SELECT coalesce(oi.quantity, 0)::numeric INTO v_need
      FROM public.order_items oi WHERE oi.id = v_item_id;

      IF v_sum < v_need THEN
        UPDATE public.order_items
        SET execution_flow = v_flow,
            fulfillment_status = 'awaiting_procurement',
            flow_assigned_at = now(),
            flow_assigned_by = v_actor
        WHERE id = v_item_id;
      ELSE
        UPDATE public.order_items
        SET execution_flow = v_flow,
            fulfillment_status = 'ready_for_dispatch',
            flow_assigned_at = now(),
            flow_assigned_by = v_actor
        WHERE id = v_item_id;
      END IF;
    ELSE
      UPDATE public.order_items
      SET execution_flow = v_flow,
          fulfillment_status = 'flow_assigned',
          flow_assigned_at = now(),
          flow_assigned_by = v_actor
      WHERE id = v_item_id;
    END IF;

    INSERT INTO public.order_fulfillment_events (order_id, order_item_id, event_type, payload, created_by)
    VALUES (
      p_order_id,
      v_item_id,
      'flow_assigned',
      jsonb_build_object('execution_flow', v_flow::text),
      v_actor
    );
  END LOOP;

  PERFORM public.recalc_order_status(p_order_id);

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_receipts_flow_assignment_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag boolean := false;
  v_order_id uuid;
  v_ref_type text;
  v_ref_number text;
  v_order_type text;
BEGIN
  SELECT coalesce(cs.require_order_flow_assignment, false)
    INTO v_flag
  FROM public.company_settings cs
  LIMIT 1;

  IF NOT coalesce(v_flag, false) THEN
    RETURN NEW;
  END IF;

  v_ref_type := lower(trim(coalesce(NEW.reference_type, '')));
  v_ref_number := nullif(trim(coalesce(NEW.reference_number, '')), '');

  IF v_ref_type = 'order' AND NEW.reference_id IS NOT NULL THEN
    v_order_id := NEW.reference_id;
  ELSIF v_ref_number IS NOT NULL
    AND v_ref_number ~ '^(TUC|RMO)/[0-9]{2}-[0-9]{2}/[0-9]+$' THEN
    SELECT o.id INTO v_order_id FROM public.orders o WHERE o.order_number = v_ref_number LIMIT 1;
  END IF;

  IF v_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(o.order_type, 'custom')::text INTO v_order_type
  FROM public.orders o WHERE o.id = v_order_id;

  IF coalesce(v_order_type, '') = 'readymade' THEN
    RETURN NEW;
  END IF;

  UPDATE public.order_items oi
  SET fulfillment_status = 'pending_flow',
      execution_flow = NULL,
      flow_assigned_at = NULL,
      flow_assigned_by = NULL
  WHERE oi.order_id = v_order_id;

  PERFORM public.recalc_order_status(v_order_id);
  RETURN NEW;
END;
$$;

-- Tighten receipt fallback checks in recalc.
CREATE OR REPLACE FUNCTION public.recalc_order_status(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current public.order_status;
  v_target public.order_status;
  v_order_number text;
  v_order_type text;
  v_has_receipt boolean := false;
  v_item_count integer := 0;
  v_done_count integer := 0;
  v_has_bom boolean := false;
  v_has_cutting boolean := false;
  v_has_batch boolean := false;
  v_total_assigned numeric := 0;
  v_total_picked numeric := 0;
  v_total_approved numeric := 0;
  v_total_rejected numeric := 0;
  v_total_dispatched numeric := 0;
  v_pending_flow integer := 0;
  v_has_outsource_pending boolean := false;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN;
  END IF;

  SELECT o.status, o.order_number, coalesce(o.order_type, 'custom')
    INTO v_current, v_order_number, v_order_type
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF v_current IS NULL THEN
    RETURN;
  END IF;

  IF v_current = 'cancelled' THEN
    RETURN;
  END IF;

  IF v_order_type = 'readymade' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.receipts r
      WHERE (
        lower(coalesce(r.reference_type, '')) = 'order' AND r.reference_id = p_order_id
      )
      OR (
        r.reference_id IS NULL
        AND r.reference_number IS NOT NULL
        AND r.reference_number ~ '^(TUC|RMO)/[0-9]{2}-[0-9]{2}/[0-9]+$'
        AND r.reference_number = v_order_number
      )
    ) INTO v_has_receipt;

    v_target := 'pending';
    IF v_has_receipt THEN
      v_target := 'confirmed';
    END IF;

    IF v_current IN ('completed') THEN
      RETURN;
    END IF;

    IF v_target IS DISTINCT FROM v_current AND v_target IS DISTINCT FROM 'ready_for_dispatch' THEN
      UPDATE public.orders SET status = v_target, updated_at = now() WHERE id = p_order_id;
    END IF;
    RETURN;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.receipts r
    WHERE (
      lower(coalesce(r.reference_type, '')) = 'order' AND r.reference_id = p_order_id
    )
    OR (
      r.reference_id IS NULL
      AND r.reference_number IS NOT NULL
      AND r.reference_number ~ '^(TUC|RMO)/[0-9]{2}-[0-9]{2}/[0-9]+$'
      AND r.reference_number = v_order_number
    )
  ) INTO v_has_receipt;

  SELECT count(*)::int INTO v_item_count FROM public.order_items oi WHERE oi.order_id = p_order_id;

  SELECT count(*)::int INTO v_done_count
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND jsonb_array_length(coalesce(oi.specifications->'mockup_images', '[]'::jsonb)) > 0
    AND jsonb_array_length(coalesce(oi.specifications->'reference_images', '[]'::jsonb)) > 0;

  SELECT count(*)::int INTO v_pending_flow
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.fulfillment_status = 'pending_flow';

  SELECT EXISTS(SELECT 1 FROM public.bom_records br WHERE br.order_id = p_order_id) INTO v_has_bom;

  SELECT EXISTS(
    SELECT 1 FROM public.order_assignments oa
    WHERE oa.order_id = p_order_id AND (oa.cutting_master_id IS NOT NULL OR oa.pattern_master_id IS NOT NULL)
  )
  OR EXISTS(
    SELECT 1 FROM public.order_cutting_assignments oca
    WHERE oca.order_id = p_order_id AND oca.cutting_master_id IS NOT NULL
  ) INTO v_has_cutting;

  SELECT EXISTS(
    SELECT 1 FROM public.order_batch_assignments oba WHERE oba.order_id = p_order_id
  ) INTO v_has_batch;

  SELECT coalesce(sum(coalesce(obsd.assigned_quantity, obsd.quantity, 0)), 0) INTO v_total_assigned
  FROM public.order_batch_size_distributions obsd
  JOIN public.order_batch_assignments oba ON oba.id = obsd.order_batch_assignment_id
  WHERE oba.order_id = p_order_id;

  SELECT coalesce(sum(obsd.picked_quantity), 0) INTO v_total_picked
  FROM public.order_batch_size_distributions obsd
  JOIN public.order_batch_assignments oba ON oba.id = obsd.order_batch_assignment_id
  WHERE oba.order_id = p_order_id;

  SELECT coalesce(sum(qr.approved_quantity), 0), coalesce(sum(qr.rejected_quantity), 0)
    INTO v_total_approved, v_total_rejected
  FROM public.qc_reviews qr
  JOIN public.order_batch_assignments oba ON oba.id = qr.order_batch_assignment_id
  WHERE oba.order_id = p_order_id;

  SELECT coalesce(sum(doi.quantity), 0) INTO v_total_dispatched
  FROM public.dispatch_order_items doi
  WHERE doi.order_id = p_order_id;

  SELECT EXISTS(
    SELECT 1
    FROM public.purchase_order_items poi
    JOIN public.purchase_orders po ON po.id = poi.po_id
    WHERE po.sales_order_id = p_order_id
      AND poi.sales_order_item_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.order_items oi
        WHERE oi.id = poi.sales_order_item_id AND oi.execution_flow = 'outsource'
      )
      AND coalesce(poi.quantity, 0) > coalesce((
        SELECT sum(coalesce(gi.approved_quantity, 0))
        FROM public.grn_items gi
        WHERE gi.po_item_id = poi.id AND lower(coalesce(gi.quality_status, '')) = 'approved'
      ), 0)
  ) INTO v_has_outsource_pending;

  v_target := 'pending';

  IF v_item_count > 0 AND v_done_count = v_item_count THEN
    v_target := 'designing_done';
  END IF;

  IF v_has_receipt THEN
    v_target := 'confirmed';
  END IF;

  IF v_has_bom THEN
    v_target := 'under_procurement';
  END IF;

  IF v_has_outsource_pending THEN
    v_target := 'under_procurement';
  END IF;

  IF v_has_cutting THEN
    v_target := 'under_cutting';
  END IF;

  IF v_has_batch THEN
    v_target := 'under_stitching';
  END IF;

  IF v_total_picked > 0 THEN
    v_target := 'under_qc';
  END IF;

  IF v_total_approved > 0 AND v_total_approved >= greatest(v_total_picked - v_total_rejected, 1) THEN
    v_target := 'ready_for_dispatch';
  END IF;

  IF v_total_rejected > 0 THEN
    v_target := 'rework';
  END IF;

  IF v_total_dispatched > 0 AND v_total_dispatched < greatest(v_total_approved - v_total_rejected, 1) THEN
    v_target := 'partial_dispatched';
  END IF;

  IF v_total_dispatched >= greatest(v_total_approved - v_total_rejected, 1) AND v_total_approved > 0 THEN
    v_target := 'dispatched';
  END IF;

  IF v_pending_flow > 0 AND v_current NOT IN ('dispatched', 'partial_dispatched', 'completed') THEN
    v_target := 'pending_flow_assignment';
  END IF;

  IF v_current IN ('completed') THEN
    RETURN;
  END IF;

  IF v_target IS DISTINCT FROM v_current THEN
    UPDATE public.orders SET status = v_target, updated_at = now() WHERE id = p_order_id;
  END IF;
END;
$$;

-- Tighten fallback in procurement queue view (both source and ensure migration endpoints use this view).
CREATE OR REPLACE VIEW public.v_orders_pending_flow_assignment AS
SELECT
  o.id AS order_id,
  o.order_number,
  o.order_date,
  o.order_type,
  o.status AS order_status,
  o.customer_id,
  c.company_name AS customer_name,
  o.created_at,
  (SELECT count(*)::int FROM public.order_items oi WHERE oi.order_id = o.id) AS line_count,
  (SELECT count(*)::int
   FROM public.order_items oi2
   WHERE oi2.order_id = o.id
    AND (
      oi2.fulfillment_status = 'pending_flow'
      OR oi2.execution_flow IS NULL
    )) AS pending_line_count,
  o.expected_delivery_date,
  o.sales_manager,
  o.final_amount,
  o.balance_amount
FROM public.orders o
LEFT JOIN public.customers c ON c.id = o.customer_id
WHERE coalesce(o.is_deleted, false) = false
  AND o.status NOT IN ('cancelled', 'completed', 'ready_for_dispatch', 'dispatched')
  AND EXISTS (SELECT 1 FROM public.company_settings cs WHERE cs.require_order_flow_assignment = true LIMIT 1)
  AND EXISTS (
    SELECT 1
    FROM public.receipts r
    WHERE (
      lower(coalesce(r.reference_type, '')) = 'order' AND r.reference_id = o.id
    )
    OR (
      r.reference_id IS NULL
      AND r.reference_number IS NOT NULL
      AND r.reference_number ~ '^(TUC|RMO)/[0-9]{2}-[0-9]{2}/[0-9]+$'
      AND r.reference_number = o.order_number
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.order_items oi
    WHERE oi.order_id = o.id
      AND (
        oi.fulfillment_status = 'pending_flow'
        OR oi.execution_flow IS NULL
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.order_items oi_started
    WHERE oi_started.order_id = o.id
      AND (
        oi_started.execution_flow IS NOT NULL
        OR oi_started.fulfillment_status IN (
          'awaiting_procurement',
          'awaiting_production',
          'awaiting_dispatch_prep',
          'ready_for_dispatch',
          'dispatched'
        )
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.bom_records br
    WHERE br.order_id = o.id
  );

GRANT SELECT ON public.v_orders_pending_flow_assignment TO authenticated, service_role;

-- Regression audit view for operational checks.
CREATE OR REPLACE VIEW public.v_order_number_legacy_audit AS
SELECT 'orders.order_number'::text AS source, count(*)::bigint AS legacy_count
FROM public.orders
WHERE order_number ~ '^(TUC|RMO)/[0-9]{2}-[0-9]{2}/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/[0-9]+$'
UNION ALL
SELECT 'receipts.reference_number', count(*)::bigint
FROM public.receipts
WHERE lower(coalesce(reference_type, '')) = 'order'
  AND reference_number ~ '^(TUC|RMO)/[0-9]{2}-[0-9]{2}/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/[0-9]+$'
UNION ALL
SELECT 'inventory_logs.reference_number', count(*)::bigint
FROM public.inventory_logs
WHERE lower(coalesce(reference_type, '')) = 'order'
  AND reference_number ~ '^(TUC|RMO)/[0-9]{2}-[0-9]{2}/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/[0-9]+$';

COMMENT ON VIEW public.v_order_number_legacy_audit IS
  'Operational regression check: each row should report legacy_count = 0.';

NOTIFY pgrst, 'reload schema';
