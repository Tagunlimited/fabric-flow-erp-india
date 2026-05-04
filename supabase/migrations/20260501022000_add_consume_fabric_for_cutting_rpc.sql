BEGIN;

CREATE OR REPLACE FUNCTION public.consume_fabric_for_cutting(
  p_order_id uuid,
  p_order_number text,
  p_fabric_id uuid,
  p_used_quantity numeric,
  p_unit text DEFAULT 'kg',
  p_user_id uuid DEFAULT NULL,
  p_user_name text DEFAULT NULL,
  p_cutting_quantity numeric DEFAULT 0,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_required numeric := GREATEST(COALESCE(p_used_quantity, 0), 0);
  v_remaining numeric := GREATEST(COALESCE(p_used_quantity, 0), 0);
  v_total_available numeric := 0;
  v_consumed numeric := 0;
  v_now timestamptz := NOW();
  v_row record;
  v_take numeric;
  v_unit text := LOWER(TRIM(COALESCE(p_unit, 'kg')));
  v_notes text := COALESCE(NULLIF(TRIM(p_notes), ''), 'Cutting fabric consumption');
  v_has_used_quantity boolean := false;
BEGIN
  IF p_order_id IS NULL OR p_fabric_id IS NULL THEN
    RAISE EXCEPTION 'Order and fabric are required';
  END IF;
  IF v_required <= 0 THEN
    RAISE EXCEPTION 'Used quantity must be greater than zero';
  END IF;

  IF v_unit IN ('kgs', 'kilogram', 'kilograms') THEN
    v_unit := 'kg';
  ELSIF v_unit IN ('gms', 'gm', 'gram', 'grams') THEN
    v_unit := 'g';
  END IF;

  SELECT COALESCE(SUM(GREATEST(COALESCE(wi.quantity, 0) - COALESCE(a.allocated_qty_other, 0), 0)), 0)
  INTO v_total_available
  FROM public.warehouse_inventory wi
  LEFT JOIN public.bins bn ON bn.id = wi.bin_id
  LEFT JOIN (
    SELECT ia.warehouse_inventory_id,
           SUM(COALESCE(ia.quantity, 0)) FILTER (WHERE b.order_id IS NOT NULL AND b.order_id <> p_order_id) AS allocated_qty_other
    FROM public.inventory_allocations ia
    LEFT JOIN public.bom_items bi ON bi.id = ia.bom_item_id
    LEFT JOIN public.boms b ON b.id = bi.bom_id
    GROUP BY warehouse_inventory_id
  ) a ON a.warehouse_inventory_id = wi.id
  WHERE wi.item_type = 'FABRIC'
    AND wi.item_id = p_fabric_id
    AND wi.status = 'IN_STORAGE'
    AND bn.location_type = 'STORAGE';

  IF v_total_available + 1e-9 < v_required THEN
    RAISE EXCEPTION 'Insufficient fabric inventory. required=%, available=%', v_required, v_total_available;
  END IF;

  FOR v_row IN
    SELECT wi.id,
           wi.status,
           GREATEST(COALESCE(wi.quantity, 0) - COALESCE(a.allocated_qty_other, 0), 0) AS available_qty
    FROM public.warehouse_inventory wi
    LEFT JOIN public.bins bn ON bn.id = wi.bin_id
    LEFT JOIN (
      SELECT ia.warehouse_inventory_id,
             SUM(COALESCE(ia.quantity, 0)) FILTER (WHERE b.order_id IS NOT NULL AND b.order_id <> p_order_id) AS allocated_qty_other
      FROM public.inventory_allocations ia
      LEFT JOIN public.bom_items bi ON bi.id = ia.bom_item_id
      LEFT JOIN public.boms b ON b.id = bi.bom_id
      GROUP BY warehouse_inventory_id
    ) a ON a.warehouse_inventory_id = wi.id
    WHERE wi.item_type = 'FABRIC'
      AND wi.item_id = p_fabric_id
      AND wi.status = 'IN_STORAGE'
      AND bn.location_type = 'STORAGE'
    ORDER BY
      COALESCE(wi.updated_at, wi.created_at, wi.created_date) ASC,
      wi.id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    IF COALESCE(v_row.available_qty, 0) <= 0 THEN
      CONTINUE;
    END IF;

    v_take := LEAST(v_remaining, COALESCE(v_row.available_qty, 0));
    UPDATE public.warehouse_inventory
    SET quantity = GREATEST(COALESCE(quantity, 0) - v_take, 0),
        updated_at = v_now
    WHERE id = v_row.id;

    v_remaining := v_remaining - v_take;
    v_consumed := v_consumed + v_take;
  END LOOP;

  IF ABS(v_consumed - v_required) > 1e-6 THEN
    RAISE EXCEPTION 'Deduction mismatch. expected=%, consumed=%', v_required, v_consumed;
  END IF;

  UPDATE public.fabric_master
  SET inventory = GREATEST(COALESCE(inventory, 0) - v_consumed, 0),
      updated_at = v_now
  WHERE id = p_fabric_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fabric_usage_records'
      AND column_name = 'used_quantity'
  ) INTO v_has_used_quantity;

  IF v_has_used_quantity THEN
    INSERT INTO public.fabric_usage_records (
      order_id, fabric_id, used_quantity, unit, used_for_cutting_date,
      used_by_id, used_by_name, cutting_quantity, notes
    )
    VALUES (
      p_order_id, p_fabric_id, v_consumed, v_unit, v_now,
      p_user_id, COALESCE(NULLIF(TRIM(p_user_name), ''), 'System'),
      COALESCE(p_cutting_quantity, 0), v_notes
    );
  ELSE
    INSERT INTO public.fabric_usage_records (
      order_id, fabric_id, actual_quantity, unit, used_at, used_by, notes
    )
    VALUES (
      p_order_id, p_fabric_id, v_consumed, v_unit, v_now, p_user_id, v_notes
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'order_number', p_order_number,
    'fabric_id', p_fabric_id,
    'consumed_quantity', v_consumed,
    'remaining_after_request', GREATEST(v_total_available - v_consumed, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_fabric_for_cutting(
  uuid, text, uuid, numeric, text, uuid, text, numeric, text
) TO authenticated;

COMMIT;
