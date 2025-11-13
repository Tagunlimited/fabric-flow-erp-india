-- Update recalc_order_status to allow mockup-only uploads to trigger designing_done status
-- User requirement: "When user uploads mockup only, also it should change the status to designing done, no need to upload reference images"

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
  v_dispatched_items integer := 0;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN;
  END IF;

  -- Get order details
  SELECT o.status, o.order_number, o.order_type
    INTO v_current, v_order_number, v_order_type
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Check for receipt (receipts can reference orders via reference_id or reference_number)
  SELECT EXISTS(
    SELECT 1 FROM public.receipts r
    WHERE (
      LOWER(COALESCE(r.reference_type, '')) = 'order' AND r.reference_id = p_order_id
    )
    OR (
      r.reference_number IS NOT NULL AND r.reference_number = v_order_number
    )
  ) INTO v_has_receipt;

  -- Design images count
  SELECT COUNT(*) INTO v_item_count 
  FROM public.order_items oi 
  WHERE oi.order_id = p_order_id;

  -- CHANGED: Count items with mockup images only (reference images not required)
  SELECT COUNT(*)
    INTO v_done_count
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND jsonb_array_length(COALESCE(oi.specifications->'mockup_images', '[]'::jsonb)) > 0;

  -- BOM check (if table exists)
  BEGIN
    SELECT EXISTS(SELECT 1 FROM public.bom_records br WHERE br.order_id = p_order_id) INTO v_has_bom;
  EXCEPTION WHEN undefined_table THEN
    v_has_bom := false;
  END;

  -- Cutting assignment check (if table exists)
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM public.order_cutting_assignments oca WHERE oca.order_id = p_order_id
    ) INTO v_has_cutting;
  EXCEPTION WHEN undefined_table THEN
    v_has_cutting := false;
  END;

  -- Batch assignment check (if table exists)
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM public.order_batch_assignments oba WHERE oba.order_id = p_order_id
    ) INTO v_has_batch;
  EXCEPTION WHEN undefined_table THEN
    v_has_batch := false;
  END;

  -- Count dispatched items (if table exists)
  BEGIN
    SELECT COUNT(DISTINCT doi.id)
      INTO v_dispatched_items
    FROM public.dispatch_order_items doi
    WHERE doi.order_id = p_order_id;
  EXCEPTION WHEN undefined_table THEN
    v_dispatched_items := 0;
  END;

  -- Determine target status with proper priority order
  -- Priority order: dispatched > partial_dispatched > under_stitching > under_cutting > under_procurement > confirmed > designing_done > pending
  v_target := 'pending';

  -- 1. When mockup images are uploaded, set to designing_done (reference images not required)
  IF v_item_count > 0 AND v_done_count = v_item_count THEN
    v_target := 'designing_done';
  END IF;

  -- 2. When receipt is generated, set to confirmed (this overrides designing_done)
  IF v_has_receipt THEN
    v_target := 'confirmed';
  END IF;

  -- 3. When BOM is created, set to under_procurement (custom orders only)
  IF v_has_bom AND v_order_type != 'readymade' THEN
    v_target := 'under_procurement';
  END IF;

  -- 4. When cutting is assigned, set to under_cutting
  IF v_has_cutting THEN
    v_target := 'under_cutting';
  END IF;

  -- 5. When stitching batches assigned, set to under_stitching
  IF v_has_batch THEN
    v_target := 'under_stitching';
  END IF;

  -- 6. When items are dispatched, set to partial_dispatched or dispatched
  IF v_dispatched_items > 0 THEN
    IF v_dispatched_items >= v_item_count THEN
      v_target := 'dispatched';
    ELSE
      v_target := 'partial_dispatched';
    END IF;
  END IF;

  -- Only update if target is different from current
  IF v_target IS DISTINCT FROM v_current THEN
    UPDATE public.orders
    SET status = v_target
    WHERE id = p_order_id;

    RAISE NOTICE 'Order % status updated: % -> %', v_order_number, v_current, v_target;
  END IF;

END;
$$;

COMMENT ON FUNCTION public.recalc_order_status(uuid) IS 
  'Recomputes order status. For designing_done: mockup images only (reference images not required). For readymade orders: pending → confirmed → ready_for_dispatch. For custom orders: full production flow.';

-- Trigger the recalculation for all existing orders to apply the new logic
DO $$
DECLARE 
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.orders LOOP
    PERFORM public.recalc_order_status(r.id);
  END LOOP;
END $$;

SELECT 'recalc_order_status updated: ONLY mockup images trigger designing_done (reference images not required)' AS status;

