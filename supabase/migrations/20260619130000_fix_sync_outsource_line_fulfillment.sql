-- order_items has no updated_at column; fix sync_outsource_line_fulfillment if 20260619120000 was already applied.

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
