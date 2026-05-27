-- MANUAL REPAIR: GRN-000111 partial approval correction
-- Run only after business confirms which line(s) should remain approved.
--
-- PREREQUISITE: Run migration 20260522150000_ensure_find_default_storage_bin.sql
--   (or apply via supabase db push) so GRN approval trigger can resolve a storage bin.
--
-- Before running:
--   1. Review lines:
--      SELECT item_name, quality_status, approved_quantity, received_quantity
--      FROM grn_items gi
--      JOIN grn_master gm ON gm.id = gi.grn_id
--      WHERE gm.grn_number = 'GRN-000111';
--   2. Replace the SELECT for v_keep_grn_item_id with the exact grn_items.id to keep approved.
--   3. Run in Supabase SQL editor; use BEGIN / ROLLBACK to preview first.

BEGIN;

-- Bootstrap storage-bin helper if migrations were not applied yet
CREATE OR REPLACE FUNCTION public.find_default_storage_bin()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT b.id
  FROM public.bins b
  WHERE b.location_type = 'STORAGE'::public.location_type
    AND COALESCE(b.is_active, true)
  ORDER BY b.created_at ASC NULLS LAST, b.id
  LIMIT 1;
$$;

DO $$
DECLARE
  v_grn_id uuid;
  v_keep_grn_item_id uuid;
BEGIN
  SELECT id INTO v_grn_id FROM public.grn_master WHERE grn_number = 'GRN-000111' LIMIT 1;
  IF v_grn_id IS NULL THEN
    RAISE EXCEPTION 'GRN-000111 not found';
  END IF;

  -- TODO: set this to the one line that should remain approved
  SELECT gi.id INTO v_keep_grn_item_id
  FROM public.grn_items gi
  WHERE gi.grn_id = v_grn_id
    AND gi.quality_status = 'approved'
  ORDER BY gi.item_name
  LIMIT 1;

  IF v_keep_grn_item_id IS NULL THEN
    RAISE EXCEPTION 'No approved line found on GRN-000111 — set v_keep_grn_item_id manually';
  END IF;

  UPDATE public.grn_items
  SET
    quality_status = 'pending',
    approved_quantity = 0,
    rejected_quantity = 0,
    updated_at = NOW()
  WHERE grn_id = v_grn_id
    AND id <> v_keep_grn_item_id;

  DELETE FROM public.warehouse_inventory wi
  USING public.grn_items gi
  WHERE wi.grn_item_id = gi.id
    AND gi.grn_id = v_grn_id
    AND gi.id <> v_keep_grn_item_id;

  IF to_regprocedure('public.update_grn_totals(uuid)') IS NOT NULL THEN
    PERFORM public.update_grn_totals(v_grn_id);
  END IF;

  -- Avoid GRN status trigger re-inserting stock while correcting header status
  ALTER TABLE public.grn_master DISABLE TRIGGER trg_after_grn_status_on_grn_master;

  UPDATE public.grn_master
  SET
    status = 'partially_approved',
    updated_at = NOW()
  WHERE id = v_grn_id;

  ALTER TABLE public.grn_master ENABLE TRIGGER trg_after_grn_status_on_grn_master;
END $$;

COMMIT;
