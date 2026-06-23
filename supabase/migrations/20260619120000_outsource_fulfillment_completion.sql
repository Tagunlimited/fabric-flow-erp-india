-- Outsource fulfillment: sync line status, recalc on PO/GRN, ready_for_dispatch from GRN.

-- Sync outsource order_items.fulfillment_status from PO + GRN linkage.
CREATE OR REPLACE FUNCTION public.sync_outsource_line_fulfillment(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line record;
  v_po_qty numeric;
  v_grn_qty numeric;
  v_dispatched numeric;
  v_target public.order_item_fulfillment_status;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN;
  END IF;

  FOR v_line IN
    SELECT oi.id, coalesce(oi.quantity, 0) AS line_qty
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.execution_flow = 'outsource'
  LOOP
    SELECT coalesce(sum(poi.quantity), 0) INTO v_po_qty
    FROM public.purchase_order_items poi
    WHERE poi.sales_order_item_id = v_line.id;

    SELECT coalesce(sum(coalesce(gi.approved_quantity, 0)), 0) INTO v_grn_qty
    FROM public.purchase_order_items poi
    JOIN public.grn_items gi ON gi.po_item_id = poi.id
    WHERE poi.sales_order_item_id = v_line.id
      AND lower(coalesce(gi.quality_status, '')) = 'approved';

    SELECT coalesce(sum(doi.quantity), 0) INTO v_dispatched
    FROM public.dispatch_order_items doi
    WHERE doi.order_item_id = v_line.id
      AND coalesce(doi.is_deleted, false) = false;

    IF v_dispatched >= greatest(v_line.line_qty, 1) AND v_line.line_qty > 0 THEN
      v_target := 'dispatched';
    ELSIF v_grn_qty >= greatest(v_line.line_qty, 1) AND v_line.line_qty > 0 THEN
      v_target := 'ready_for_dispatch';
    ELSIF v_po_qty > 0 THEN
      v_target := 'awaiting_procurement';
    ELSE
      v_target := 'flow_assigned';
    END IF;

    UPDATE public.order_items oi
    SET fulfillment_status = v_target
    WHERE oi.id = v_line.id
      AND oi.fulfillment_status IS DISTINCT FROM v_target;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_outsource_line_fulfillment(uuid) TO authenticated, service_role;

-- Extend recalc_order_status: outsource GRN can drive ready_for_dispatch when stitching QC is not required.
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
  v_outsource_line_count integer := 0;
  v_outsource_ready_count integer := 0;
  v_stitching_line_count integer := 0;
  v_outsource_grn_total numeric := 0;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.sync_outsource_line_fulfillment(p_order_id);

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

  SELECT count(*)::int INTO v_outsource_line_count
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id AND oi.execution_flow = 'outsource';

  SELECT count(*)::int INTO v_outsource_ready_count
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.execution_flow = 'outsource'
    AND oi.fulfillment_status IN ('ready_for_dispatch', 'dispatched');

  SELECT count(*)::int INTO v_stitching_line_count
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND (oi.execution_flow = 'stitching' OR oi.execution_flow IS NULL);

  SELECT coalesce(sum(sub.grn_qty), 0) INTO v_outsource_grn_total
  FROM (
    SELECT coalesce(sum(coalesce(gi.approved_quantity, 0)), 0) AS grn_qty
    FROM public.order_items oi
    JOIN public.purchase_order_items poi ON poi.sales_order_item_id = oi.id
    LEFT JOIN public.grn_items gi ON gi.po_item_id = poi.id
      AND lower(coalesce(gi.quality_status, '')) = 'approved'
    WHERE oi.order_id = p_order_id
      AND oi.execution_flow = 'outsource'
    GROUP BY oi.id
  ) sub;

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

  IF v_total_approved > 0
     AND v_total_approved >= greatest(v_total_picked - v_total_rejected, 1)
     AND (v_outsource_line_count = 0 OR v_outsource_ready_count = v_outsource_line_count) THEN
    v_target := 'ready_for_dispatch';
  ELSIF v_outsource_line_count > 0
        AND v_outsource_ready_count = v_outsource_line_count
        AND v_stitching_line_count = 0
        AND NOT v_has_batch THEN
    v_target := 'ready_for_dispatch';
  END IF;

  IF v_total_rejected > 0 THEN
    v_target := 'rework';
  END IF;

  IF v_total_dispatched > 0 AND v_total_dispatched < greatest(v_total_approved - v_total_rejected, 1) THEN
    v_target := 'partial_dispatched';
  ELSIF v_outsource_line_count > 0
        AND v_stitching_line_count = 0
        AND NOT v_has_batch
        AND v_total_dispatched > 0
        AND v_total_dispatched < greatest(v_outsource_grn_total, 1) THEN
    v_target := 'partial_dispatched';
  END IF;

  IF v_total_dispatched >= greatest(v_total_approved - v_total_rejected, 1) AND v_total_approved > 0 THEN
    v_target := 'dispatched';
  ELSIF v_outsource_line_count > 0
        AND v_stitching_line_count = 0
        AND NOT v_has_batch
        AND v_total_dispatched >= greatest(v_outsource_grn_total, 1)
        AND v_outsource_grn_total > 0 THEN
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

GRANT EXECUTE ON FUNCTION public.recalc_order_status(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trigger_purchase_orders_recalc_sales_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.sales_order_id IS NOT NULL THEN
      PERFORM public.recalc_order_status(OLD.sales_order_id);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.sales_order_id IS NOT NULL THEN
    PERFORM public.recalc_order_status(NEW.sales_order_id);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.sales_order_id IS DISTINCT FROM NEW.sales_order_id AND OLD.sales_order_id IS NOT NULL THEN
    PERFORM public.recalc_order_status(OLD.sales_order_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchase_orders_recalc_sales_order ON public.purchase_orders;
CREATE TRIGGER purchase_orders_recalc_sales_order
  AFTER INSERT OR UPDATE OF sales_order_id OR DELETE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.trigger_purchase_orders_recalc_sales_order();

CREATE OR REPLACE FUNCTION public.trigger_po_items_recalc_sales_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.sales_order_item_id IS NOT NULL THEN
      SELECT oi.order_id INTO v_order_id FROM public.order_items oi WHERE oi.id = OLD.sales_order_item_id;
      IF v_order_id IS NOT NULL THEN
        PERFORM public.recalc_order_status(v_order_id);
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.sales_order_item_id IS NOT NULL THEN
    SELECT oi.order_id INTO v_order_id FROM public.order_items oi WHERE oi.id = NEW.sales_order_item_id;
    IF v_order_id IS NOT NULL THEN
      PERFORM public.recalc_order_status(v_order_id);
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.sales_order_item_id IS DISTINCT FROM NEW.sales_order_item_id AND OLD.sales_order_item_id IS NOT NULL THEN
    SELECT oi.order_id INTO v_order_id FROM public.order_items oi WHERE oi.id = OLD.sales_order_item_id;
    IF v_order_id IS NOT NULL THEN
      PERFORM public.recalc_order_status(v_order_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS po_items_recalc_sales_order ON public.purchase_order_items;
CREATE TRIGGER po_items_recalc_sales_order
  AFTER INSERT OR UPDATE OF sales_order_item_id, quantity OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.trigger_po_items_recalc_sales_order();

CREATE OR REPLACE FUNCTION public.trigger_grn_items_recalc_sales_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po_item_id uuid;
  v_order_id uuid;
BEGIN
  v_po_item_id := coalesce(NEW.po_item_id, OLD.po_item_id);
  IF v_po_item_id IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  SELECT oi.order_id INTO v_order_id
  FROM public.purchase_order_items poi
  JOIN public.order_items oi ON oi.id = poi.sales_order_item_id
  WHERE poi.id = v_po_item_id
  LIMIT 1;

  IF v_order_id IS NOT NULL THEN
    PERFORM public.recalc_order_status(v_order_id);
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS grn_items_recalc_sales_order ON public.grn_items;
CREATE TRIGGER grn_items_recalc_sales_order
  AFTER INSERT OR UPDATE OF approved_quantity, quality_status OR DELETE ON public.grn_items
  FOR EACH ROW EXECUTE FUNCTION public.trigger_grn_items_recalc_sales_order();

COMMENT ON FUNCTION public.recalc_order_status(uuid) IS
  'Recomputes orders.status including outsource GRN readiness and pending_flow_assignment.';
