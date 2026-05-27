-- Auto-sync grn_master totals when grn_items change (line counts + amounts).

CREATE OR REPLACE FUNCTION public.update_grn_totals(grn_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.grn_master
  SET
    total_items_received = (
      SELECT COUNT(*) FROM public.grn_items WHERE grn_id = grn_uuid
    ),
    total_items_approved = (
      SELECT COUNT(*) FROM public.grn_items WHERE grn_id = grn_uuid AND quality_status = 'approved'
    ),
    total_items_rejected = (
      SELECT COUNT(*)
      FROM public.grn_items
      WHERE grn_id = grn_uuid
        AND quality_status IN ('rejected', 'damaged')
    ),
    total_amount_received = (
      SELECT COALESCE(SUM(line_total), 0) FROM public.grn_items WHERE grn_id = grn_uuid
    ),
    total_amount_approved = (
      SELECT COALESCE(SUM(line_total), 0)
      FROM public.grn_items
      WHERE grn_id = grn_uuid AND quality_status = 'approved'
    ),
    updated_at = NOW()
  WHERE id = grn_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_update_grn_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.update_grn_totals(COALESCE(NEW.grn_id, OLD.grn_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_grn_items_update_totals ON public.grn_items;
CREATE TRIGGER trigger_grn_items_update_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.grn_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_update_grn_totals();

-- Backfill header totals for existing GRNs.
DO $$
DECLARE
  v_grn_id uuid;
BEGIN
  FOR v_grn_id IN SELECT id FROM public.grn_master LOOP
    PERFORM public.update_grn_totals(v_grn_id);
  END LOOP;
END $$;
