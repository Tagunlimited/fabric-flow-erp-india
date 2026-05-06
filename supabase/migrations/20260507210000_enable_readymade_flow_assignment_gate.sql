-- Include readymade orders in receipt-gated flow assignment queue.
-- Keeps receipt + feature-flag gating, but removes custom-only restriction.

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
  ELSIF v_ref_number IS NOT NULL
    AND v_ref_number ~ '^(TUC|RMO)/[0-9]{2}-[0-9]{2}/[0-9]+$' THEN
    SELECT o.id INTO v_order_id
    FROM public.orders o
    WHERE o.order_number = v_ref_number
    LIMIT 1;
  END IF;

  IF v_order_id IS NULL THEN
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

NOTIFY pgrst, 'reload schema';
