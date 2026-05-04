-- Replace recalc_order_status: pending_flow_assignment, readymade branch, custom rollup, outsource procurement hint.

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

  -- Readymade: minimal path (receipt -> confirmed; no auto pending_flow gate in recalc)
  IF v_order_type = 'readymade' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.receipts r
      WHERE (
        lower(coalesce(r.reference_type, '')) = 'order' AND r.reference_id = p_order_id
      )
      OR (
        r.reference_number IS NOT NULL AND r.reference_number = v_order_number
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

  -- Custom (and default) orders
  SELECT EXISTS(
    SELECT 1 FROM public.receipts r
    WHERE (
      lower(coalesce(r.reference_type, '')) = 'order' AND r.reference_id = p_order_id
    )
    OR (
      r.reference_number IS NOT NULL AND r.reference_number = v_order_number
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

  -- Outsource lines: PO created but not fully approved on GRN
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

  -- Lines still awaiting flow choice block earlier operational stages (but not finished dispatch).
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

COMMENT ON FUNCTION public.recalc_order_status(uuid) IS
  'Recomputes orders.status including pending_flow_assignment and outsource procurement.';
