-- RPC: assign_order_item_flows + receipt trigger to enter pending_flow when company flag is on.

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
      r.reference_number IS NOT NULL AND r.reference_number = v_order_number
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

REVOKE ALL ON FUNCTION public.assign_order_item_flows(uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_order_item_flows(uuid, jsonb, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.assign_order_item_flows IS
  'Atomically assigns execution_flow per order line; optional inventory[] for inventory flow.';

-- Receipt hook: when company flag is on, newly linked receipts reset lines to pending_flow (custom orders).
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
  ELSIF v_ref_number IS NOT NULL THEN
    SELECT o.id INTO v_order_id FROM public.orders o WHERE o.order_number = v_ref_number LIMIT 1;
  END IF;

  IF v_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(o.order_type, 'custom')::text INTO v_order_type
  FROM public.orders o WHERE o.id = v_order_id;

  -- Readymade: skip forcing pending_flow (existing readymade recalc path).
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

DROP TRIGGER IF EXISTS receipts_flow_assignment_gate ON public.receipts;
CREATE TRIGGER receipts_flow_assignment_gate
AFTER INSERT ON public.receipts
FOR EACH ROW
EXECUTE FUNCTION public.trg_receipts_flow_assignment_gate();
