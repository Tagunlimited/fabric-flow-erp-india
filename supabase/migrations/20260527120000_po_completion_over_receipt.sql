-- PO completion: count over-receipt (received > ordered) and re-check when GRN lines are approved.

CREATE OR REPLACE FUNCTION public.check_and_update_po_completion(p_po_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_all_items_received BOOLEAN;
  v_po_status TEXT;
BEGIN
  SELECT status INTO v_po_status
  FROM public.purchase_orders
  WHERE id = p_po_id;

  IF v_po_status IS NULL OR v_po_status IN ('completed', 'cancelled') THEN
    RETURN FALSE;
  END IF;

  SELECT BOOL_AND(
    COALESCE(poi.quantity, 0) <= COALESCE(grn_totals.total_received, 0)
  ) INTO v_all_items_received
  FROM public.purchase_order_items poi
  LEFT JOIN (
    SELECT
      gi.po_item_id,
      SUM(
        CASE
          WHEN lower(coalesce(gi.quality_status, '')) IN ('approved', 'passed') THEN
            GREATEST(
              COALESCE(gi.approved_quantity, 0),
              COALESCE(gi.received_quantity, 0)
            )
          ELSE 0
        END
      ) AS total_received
    FROM public.grn_items gi
    GROUP BY gi.po_item_id
  ) grn_totals ON grn_totals.po_item_id = poi.id
  WHERE poi.po_id = p_po_id;

  IF v_all_items_received THEN
    UPDATE public.purchase_orders
    SET status = 'completed',
        updated_at = NOW()
    WHERE id = p_po_id
      AND status IS DISTINCT FROM 'completed';
  END IF;

  RETURN COALESCE(v_all_items_received, FALSE);
END;
$$;

COMMENT ON FUNCTION public.check_and_update_po_completion(UUID) IS
  'Marks PO completed when every line has approved GRN qty >= ordered qty (over-receipt counts via GREATEST approved/received).';

CREATE OR REPLACE FUNCTION public.trg_grn_items_check_po_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_po_id UUID;
BEGIN
  SELECT gm.po_id INTO v_po_id
  FROM public.grn_master gm
  WHERE gm.id = COALESCE(NEW.grn_id, OLD.grn_id);

  IF v_po_id IS NOT NULL
     AND lower(coalesce(NEW.quality_status, '')) IN ('approved', 'passed') THEN
    PERFORM public.check_and_update_po_completion(v_po_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_grn_items_po_completion ON public.grn_items;
CREATE TRIGGER trg_grn_items_po_completion
AFTER INSERT OR UPDATE OF quality_status, approved_quantity, received_quantity
ON public.grn_items
FOR EACH ROW
EXECUTE FUNCTION public.trg_grn_items_check_po_completion();
