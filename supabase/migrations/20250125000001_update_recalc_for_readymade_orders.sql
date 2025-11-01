-- Update recalc_order_status function to handle readymade orders differently
-- Readymade orders: pending → confirmed (when receipt created) → ready_for_dispatch (skip production)

-- First, read the existing function from 20250101130000_fix_order_status_priority.sql
-- We need to modify it to check order_type and handle readymade orders

CREATE OR REPLACE FUNCTION public.recalc_order_status(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
  v_total_assigned integer := 0;
  v_total_picked integer := 0;
  v_total_approved integer := 0;
  v_total_rejected integer := 0;
  v_total_dispatched integer := 0;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN;
  END IF;

  SELECT o.status, o.order_number, COALESCE(o.order_type, 'custom')
    INTO v_current, v_order_number, v_order_type
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF v_current IS NULL THEN
    RETURN;
  END IF;

  -- Do not change cancelled orders
  IF v_current = 'cancelled' THEN
    RETURN;
  END IF;

  -- Check if this is a readymade order - handle it differently
  IF v_order_type = 'readymade' THEN
    -- For readymade orders: pending → confirmed → ready_for_dispatch (skip production)
    
    -- Check for receipt
    SELECT EXISTS(
      SELECT 1
      FROM public.receipts r
      WHERE (
        LOWER(COALESCE(r.reference_type, '')) = 'order' AND r.reference_id = p_order_id
      )
      OR (
        r.reference_number IS NOT NULL AND r.reference_number = v_order_number
      )
    ) INTO v_has_receipt;

    -- Determine status for readymade orders
    v_target := 'pending';
    
    -- When receipt is generated, set to confirmed
    IF v_has_receipt THEN
      v_target := 'confirmed';
    END IF;
    
    -- After confirmed, readymade orders are ready for dispatch (no production needed)
    -- This means once confirmed, they can be dispatched immediately
    -- We'll let the system manually move to ready_for_dispatch or dispatch
    -- But we don't auto-promote to ready_for_dispatch here to give manual control
    
    -- Update status if it has changed (but don't auto-promote to ready_for_dispatch)
    IF v_target IS DISTINCT FROM v_current AND v_target != 'ready_for_dispatch' THEN
      UPDATE public.orders
      SET status = v_target,
          updated_at = NOW()
      WHERE id = p_order_id;
    END IF;
    
    RETURN; -- Exit early for readymade orders
  END IF;

  -- Below is the original logic for custom orders
  
  -- Receipts check
  SELECT EXISTS(
    SELECT 1
    FROM public.receipts r
    WHERE (
      LOWER(COALESCE(r.reference_type, '')) = 'order' AND r.reference_id = p_order_id
    )
    OR (
      r.reference_number IS NOT NULL AND r.reference_number = v_order_number
    )
  ) INTO v_has_receipt;

  -- Design images check
  SELECT COUNT(*)
    INTO v_item_count
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  SELECT COUNT(*)
    INTO v_done_count
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND jsonb_array_length(COALESCE(oi.specifications->'mockup_images', '[]'::jsonb)) > 0
    AND jsonb_array_length(COALESCE(oi.specifications->'reference_images', '[]'::jsonb)) > 0;

  -- BOM check
  SELECT EXISTS(SELECT 1 FROM public.bom_records br WHERE br.order_id = p_order_id) INTO v_has_bom;

  -- Cutting assignment check
  SELECT EXISTS(
    SELECT 1
    FROM public.order_assignments oa
    WHERE oa.order_id = p_order_id AND (oa.cutting_master_id IS NOT NULL OR oa.pattern_master_id IS NOT NULL)
  ) INTO v_has_cutting;

  -- Batch assignment check
  SELECT EXISTS(
    SELECT 1 FROM public.order_batch_assignments oba WHERE oba.order_id = p_order_id
  ) INTO v_has_batch;

  -- Get totals for production stages
  SELECT COALESCE(SUM(obsd.assigned_quantity), 0)
    INTO v_total_assigned
  FROM public.order_batch_size_distributions obsd
  JOIN public.order_batch_assignments oba ON oba.id = obsd.order_batch_assignment_id
  WHERE oba.order_id = p_order_id;

  SELECT COALESCE(SUM(obsd.picked_quantity), 0)
    INTO v_total_picked
  FROM public.order_batch_size_distributions obsd
  JOIN public.order_batch_assignments oba ON oba.id = obsd.order_batch_assignment_id
  WHERE oba.order_id = p_order_id;

  SELECT COALESCE(SUM(qr.approved_quantity), 0), COALESCE(SUM(qr.rejected_quantity), 0)
    INTO v_total_approved, v_total_rejected
  FROM public.qc_reviews qr
  JOIN public.order_batch_assignments oba ON oba.id = qr.order_batch_assignment_id
  WHERE oba.order_id = p_order_id;

  -- Dispatch totals from dispatch_order_items
  SELECT COALESCE(SUM(doi.quantity), 0)
    INTO v_total_dispatched
  FROM public.dispatch_order_items doi
  WHERE doi.order_id = p_order_id;

  -- Determine target status with proper priority order
  -- Priority order: dispatched > partial_dispatched > rework > ready_for_dispatch > under_qc > under_stitching > under_cutting > under_procurement > confirmed > designing_done > pending
  v_target := 'pending';

  -- 1. When mockup/reference images are uploaded, set to designing_done (base design stage)
  IF v_item_count > 0 AND v_done_count = v_item_count THEN
    v_target := 'designing_done';
  END IF;

  -- 2. When receipt is generated, set to confirmed (this overrides designing_done)
  IF v_has_receipt THEN
    v_target := 'confirmed';
  END IF;

  -- 3. Production flow stages - each overrides the previous
  IF v_has_bom THEN
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

  -- Ready when approved covers effective picked (picked minus rejected)
  IF v_total_approved > 0 AND v_total_approved >= GREATEST(v_total_picked - v_total_rejected, 1) THEN
    v_target := 'ready_for_dispatch';
  END IF;

  -- Rework overrides most states (when rejected items exist)
  IF v_total_rejected > 0 THEN
    v_target := 'rework';
  END IF;

  -- Dispatch states override earlier production states
  IF v_total_dispatched > 0 AND v_total_dispatched < GREATEST(v_total_approved - v_total_rejected, 1) THEN
    v_target := 'partial_dispatched';
  END IF;

  IF v_total_dispatched >= GREATEST(v_total_approved - v_total_rejected, 1) AND v_total_approved > 0 THEN
    v_target := 'dispatched';
  END IF;

  -- Do not override when already in later/completed stages
  IF v_current IN ('completed') THEN
    RETURN;
  END IF;

  -- Update status if it has changed
  IF v_target IS DISTINCT FROM v_current THEN
    UPDATE public.orders
    SET status = v_target,
        updated_at = NOW()
    WHERE id = p_order_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.recalc_order_status(uuid) IS 'Recomputes orders.status. For readymade orders: pending → confirmed (when receipt created). For custom orders: full production flow.';

