-- Assigned flow queue view + safe re-assign support on assign_order_item_flows.

CREATE OR REPLACE FUNCTION public.order_flow_reassign_block_reason(p_order_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_order_id IS NULL THEN
    RETURN 'order_id required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND (
        oi.execution_flow IS NULL
        OR oi.fulfillment_status IS DISTINCT FROM 'flow_assigned'
      )
  ) THEN
    RETURN 'One or more lines are not in flow_assigned state';
  END IF;

  IF EXISTS (SELECT 1 FROM public.bom_records br WHERE br.order_id = p_order_id) THEN
    RETURN 'BOM already created for this order';
  END IF;

  IF EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.sales_order_id = p_order_id) THEN
    RETURN 'Purchase order already linked to this order';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.purchase_order_items poi
    JOIN public.order_items oi ON oi.id = poi.sales_order_item_id
    WHERE oi.order_id = p_order_id
  ) THEN
    RETURN 'Purchase order line linked to an order item';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.dispatch_order_items doi
    JOIN public.order_items oi ON oi.id = doi.order_item_id
    WHERE oi.order_id = p_order_id
  ) THEN
    RETURN 'Dispatch already exists for a line on this order';
  END IF;

  IF EXISTS (SELECT 1 FROM public.order_cutting_assignments oca WHERE oca.order_id = p_order_id) THEN
    RETURN 'Cutting assignments exist for this order';
  END IF;

  IF EXISTS (SELECT 1 FROM public.order_batch_assignments oba WHERE oba.order_id = p_order_id) THEN
    RETURN 'Production batch assignments exist for this order';
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.order_flow_reassign_block_reason(uuid) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_orders_flow_assigned AS
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
  (
    SELECT count(*)::int
    FROM public.order_items oi2
    WHERE oi2.order_id = o.id
      AND oi2.execution_flow IS NOT NULL
  ) AS assigned_line_count,
  (
    SELECT string_agg(flow_label, ', ' ORDER BY flow_label)
    FROM (
      SELECT
        CASE oi3.execution_flow::text
          WHEN 'stitching' THEN 'stitching'
          WHEN 'outsource' THEN 'outsource'
          WHEN 'inventory' THEN 'inventory'
          ELSE oi3.execution_flow::text
        END || ': ' || count(*)::text AS flow_label
      FROM public.order_items oi3
      WHERE oi3.order_id = o.id
        AND oi3.execution_flow IS NOT NULL
      GROUP BY oi3.execution_flow
    ) fs
  ) AS flow_summary,
  public.order_flow_reassign_block_reason(o.id) IS NULL AS can_reassign,
  public.order_flow_reassign_block_reason(o.id) AS reassign_block_reason,
  o.expected_delivery_date,
  o.sales_manager,
  o.final_amount,
  o.balance_amount
FROM public.orders o
LEFT JOIN public.customers c ON c.id = o.customer_id
WHERE coalesce(o.is_deleted, false) = false
  AND o.status <> 'cancelled'
  AND EXISTS (
    SELECT 1
    FROM public.company_settings cs
    WHERE cs.require_order_flow_assignment = true
    LIMIT 1
  )
  AND EXISTS (
    SELECT 1
    FROM public.receipts r
    WHERE (
      lower(trim(coalesce(r.reference_type, ''))) = 'order'
      AND r.reference_id = o.id
    )
    OR (
      nullif(trim(coalesce(r.reference_number, '')), '') = o.order_number
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.order_items oi_pending
    WHERE oi_pending.order_id = o.id
      AND (
        oi_pending.fulfillment_status = 'pending_flow'
        OR oi_pending.execution_flow IS NULL
      )
  )
  AND EXISTS (
    SELECT 1
    FROM public.order_items oi_assigned
    WHERE oi_assigned.order_id = o.id
      AND oi_assigned.execution_flow IS NOT NULL
  );

GRANT SELECT ON public.v_orders_flow_assigned TO authenticated, service_role;

COMMENT ON VIEW public.v_orders_flow_assigned IS
  'Receipt-linked orders with all lines assigned an execution flow. can_reassign is true only in the safe window (all lines flow_assigned, no BOM/PO/cutting/dispatch).';

DROP FUNCTION IF EXISTS public.assign_order_item_flows(uuid, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.assign_order_item_flows(
  p_order_id uuid,
  p_assignments jsonb,
  p_actor uuid DEFAULT NULL,
  p_mode text DEFAULT 'assign'
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
  v_mode text;
  v_line_status text;
  v_line_flow public.order_item_execution_flow;
  v_reassign_block text;
  v_prev_assignment_id uuid;
  v_event_payload jsonb;
BEGIN
  v_actor := coalesce(p_actor, auth.uid());
  v_mode := lower(trim(coalesce(p_mode, 'assign')));

  IF v_mode NOT IN ('assign', 'reassign') THEN
    RAISE EXCEPTION 'p_mode must be assign or reassign';
  END IF;

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

  IF v_mode = 'reassign' THEN
    v_reassign_block := public.order_flow_reassign_block_reason(p_order_id);
    IF v_reassign_block IS NOT NULL THEN
      RAISE EXCEPTION '%', v_reassign_block;
    END IF;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_assignments)
  LOOP
    v_item_id := (v_row->>'order_item_id')::uuid;
    v_flow := (v_row->>'execution_flow')::public.order_item_execution_flow;

    IF v_item_id IS NULL OR v_flow IS NULL THEN
      RAISE EXCEPTION 'each assignment requires order_item_id and execution_flow';
    END IF;

    SELECT oi.fulfillment_status, oi.execution_flow
      INTO v_line_status, v_line_flow
    FROM public.order_items oi
    WHERE oi.id = v_item_id AND oi.order_id = p_order_id
    FOR UPDATE;

    IF v_line_status IS NULL THEN
      RAISE EXCEPTION 'order_item % does not belong to this order', v_item_id;
    END IF;

    IF v_mode = 'assign' THEN
      IF v_line_status IS DISTINCT FROM 'pending_flow' AND v_line_flow IS NOT NULL THEN
        RAISE EXCEPTION 'line % is not awaiting flow assignment', v_item_id;
      END IF;
    ELSE
      IF v_line_status IS DISTINCT FROM 'flow_assigned' THEN
        RAISE EXCEPTION 'line % must be flow_assigned to re-assign (status: %)', v_item_id, v_line_status;
      END IF;
    END IF;

    v_prev_assignment_id := NULL;
    IF v_mode = 'reassign' THEN
      SELECT a.id
        INTO v_prev_assignment_id
      FROM public.order_item_flow_assignments a
      WHERE a.order_item_id = v_item_id
      ORDER BY a.assigned_at DESC
      LIMIT 1;
    END IF;

    IF v_mode = 'reassign' AND v_flow <> 'inventory' THEN
      DELETE FROM public.order_item_inventory_commitments
      WHERE order_item_id = v_item_id AND state = 'reserved';
    END IF;

    INSERT INTO public.order_item_flow_assignments (
      order_item_id, execution_flow, assigned_by, assigned_at, supersedes_assignment_id
    ) VALUES (
      v_item_id, v_flow, v_actor, now(), v_prev_assignment_id
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

    v_event_payload := jsonb_build_object('execution_flow', v_flow::text);
    IF v_mode = 'reassign' THEN
      v_event_payload := v_event_payload || jsonb_build_object('reassign', true);
    END IF;

    INSERT INTO public.order_fulfillment_events (order_id, order_item_id, event_type, payload, created_by)
    VALUES (
      p_order_id,
      v_item_id,
      'flow_assigned',
      v_event_payload,
      v_actor
    );
  END LOOP;

  PERFORM public.recalc_order_status(p_order_id);

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'mode', v_mode);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_order_item_flows(uuid, jsonb, uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
