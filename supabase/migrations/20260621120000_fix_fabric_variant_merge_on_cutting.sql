-- When linking orphan warehouse fabric rows to fabric_master.item_id, merge into an
-- existing (item_id, bin_id, status, unit) row instead of violating ux_wh_fabric_variant_active.

BEGIN;

CREATE OR REPLACE FUNCTION public.link_or_merge_warehouse_fabric_row(
  p_source_wi_id uuid,
  p_fabric_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_source public.warehouse_inventory%ROWTYPE;
  v_target_id uuid;
BEGIN
  IF p_source_wi_id IS NULL OR p_fabric_id IS NULL THEN
    RETURN p_source_wi_id;
  END IF;

  SELECT * INTO v_source
  FROM public.warehouse_inventory
  WHERE id = p_source_wi_id
  FOR UPDATE;

  IF NOT FOUND OR v_source.item_type <> 'FABRIC' THEN
    RETURN p_source_wi_id;
  END IF;

  IF v_source.item_id = p_fabric_id THEN
    RETURN p_source_wi_id;
  END IF;

  SELECT wi2.id
  INTO v_target_id
  FROM public.warehouse_inventory wi2
  WHERE wi2.item_type = 'FABRIC'
    AND wi2.item_id = p_fabric_id
    AND wi2.bin_id IS NOT DISTINCT FROM v_source.bin_id
    AND wi2.status IS NOT DISTINCT FROM v_source.status
    AND wi2.unit IS NOT DISTINCT FROM v_source.unit
    AND wi2.id <> v_source.id
  LIMIT 1;

  IF v_target_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables t
      WHERE t.table_schema = 'public'
        AND t.table_name = 'inventory_allocations'
    ) THEN
      UPDATE public.inventory_allocations ia
      SET warehouse_inventory_id = v_target_id
      WHERE ia.warehouse_inventory_id = v_source.id;
    END IF;

    UPDATE public.warehouse_inventory wi
    SET quantity = COALESCE(wi.quantity, 0) + COALESCE(v_source.quantity, 0),
        updated_at = NOW()
    WHERE wi.id = v_target_id;

    DELETE FROM public.warehouse_inventory
    WHERE id = v_source.id;

    RETURN v_target_id;
  END IF;

  UPDATE public.warehouse_inventory
  SET item_id = p_fabric_id,
      updated_at = NOW()
  WHERE id = p_source_wi_id;

  RETURN p_source_wi_id;
END;
$$;

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
  v_link_row record;
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

  -- Link orphan / mismatched GRN rows to fabric_master (merge when variant row already exists).
  FOR v_link_row IN
    SELECT wi.id
    FROM public.warehouse_inventory wi
    WHERE wi.item_type = 'FABRIC'
      AND (wi.item_id IS NULL OR wi.item_id IS DISTINCT FROM p_fabric_id)
      AND public.warehouse_row_matches_fabric_for_cutting(p_fabric_id, wi)
  LOOP
    PERFORM public.link_or_merge_warehouse_fabric_row(v_link_row.id, p_fabric_id);
  END LOOP;

  SELECT COALESCE(SUM(GREATEST(COALESCE(wi.quantity, 0) - COALESCE(a.allocated_qty_other, 0), 0)), 0)
  INTO v_total_available
  FROM public.warehouse_inventory wi
  LEFT JOIN public.bins bn ON bn.id = wi.bin_id
  LEFT JOIN (
    SELECT ia.warehouse_inventory_id,
           SUM(COALESCE(ia.quantity, 0)) FILTER (
             WHERE br.order_id IS NOT NULL AND br.order_id <> p_order_id
           ) AS allocated_qty_other
    FROM public.inventory_allocations ia
    LEFT JOIN public.bom_record_items bri ON bri.id = ia.bom_item_id
    LEFT JOIN public.bom_records br ON br.id = COALESCE(ia.bom_id, bri.bom_id)
    GROUP BY ia.warehouse_inventory_id
  ) a ON a.warehouse_inventory_id = wi.id
  WHERE wi.item_type = 'FABRIC'
    AND public.warehouse_row_matches_fabric_for_cutting(p_fabric_id, wi)
    AND (
      (wi.status = 'IN_STORAGE' AND bn.location_type::text = 'STORAGE')
      OR (wi.status = 'READY_TO_DISPATCH' AND bn.location_type::text = 'DISPATCH_ZONE')
    );

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
             SUM(COALESCE(ia.quantity, 0)) FILTER (
               WHERE br.order_id IS NOT NULL AND br.order_id <> p_order_id
             ) AS allocated_qty_other
      FROM public.inventory_allocations ia
      LEFT JOIN public.bom_record_items bri ON bri.id = ia.bom_item_id
      LEFT JOIN public.bom_records br ON br.id = COALESCE(ia.bom_id, bri.bom_id)
      GROUP BY ia.warehouse_inventory_id
    ) a ON a.warehouse_inventory_id = wi.id
    WHERE wi.item_type = 'FABRIC'
      AND public.warehouse_row_matches_fabric_for_cutting(p_fabric_id, wi)
      AND (
        (wi.status = 'IN_STORAGE' AND bn.location_type::text = 'STORAGE')
        OR (wi.status = 'READY_TO_DISPATCH' AND bn.location_type::text = 'DISPATCH_ZONE')
      )
    ORDER BY
      COALESCE(wi.updated_at, wi.created_at) ASC,
      wi.id ASC
    FOR UPDATE OF wi
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

GRANT EXECUTE ON FUNCTION public.link_or_merge_warehouse_fabric_row(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_fabric_for_cutting(
  uuid, text, uuid, numeric, text, uuid, text, numeric, text
) TO authenticated;

COMMIT;
