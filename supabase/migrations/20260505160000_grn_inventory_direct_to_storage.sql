-- GRN / warehouse: place new stock directly in STORAGE with IN_STORAGE.
-- Migrates legacy RECEIVED rows in RECEIVING_ZONE bins into STORAGE (merge on unique key).

-- 1) Optional column used by the app for storage placement audit
ALTER TABLE public.warehouse_inventory
  ADD COLUMN IF NOT EXISTS moved_to_storage_date TIMESTAMPTZ;

COMMENT ON COLUMN public.warehouse_inventory.moved_to_storage_date IS
  'When stock was placed or consolidated into a storage bin (GRN auto-place, transfer, or migration).';

-- 2) Default STORAGE bin: first active STORAGE bin in a warehouse (by created_at, then id)
CREATE OR REPLACE FUNCTION public.find_default_storage_bin_for_warehouse(p_warehouse_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT b.id
  FROM public.bins b
  JOIN public.racks r ON r.id = b.rack_id
  JOIN public.floors f ON f.id = r.floor_id
  WHERE f.warehouse_id = p_warehouse_id
    AND b.location_type = 'STORAGE'::public.location_type
    AND COALESCE(b.is_active, true)
  ORDER BY b.created_at ASC NULLS LAST, b.id
  LIMIT 1;
$$;

-- Global fallback: first active STORAGE bin anywhere
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

-- Backwards-compatible name: callers expecting a "default GRN bin" now get storage.
CREATE OR REPLACE FUNCTION public.find_default_receiving_bin()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT public.find_default_storage_bin();
$$;

-- 3) Move RECEIVED inventory out of RECEIVING_ZONE bins (merge into existing IN_STORAGE same identity)
DO $$
DECLARE
  r RECORD;
  v_wh uuid;
  v_target uuid;
  v_merge_id uuid;
BEGIN
  FOR r IN
    SELECT wi.id,
           wi.item_id,
           wi.item_type,
           wi.unit,
           wi.quantity,
           wi.bin_id
    FROM public.warehouse_inventory wi
    INNER JOIN public.bins b ON b.id = wi.bin_id
    WHERE wi.status = 'RECEIVED'::public.inventory_status
      AND b.location_type = 'RECEIVING_ZONE'::public.location_type
    ORDER BY wi.id
  LOOP
    SELECT f.warehouse_id
    INTO v_wh
    FROM public.bins b_src
    JOIN public.racks r2 ON r2.id = b_src.rack_id
    JOIN public.floors f ON f.id = r2.floor_id
    WHERE b_src.id = r.bin_id;

    v_target := NULL;
    IF v_wh IS NOT NULL THEN
      v_target := public.find_default_storage_bin_for_warehouse(v_wh);
    END IF;

    IF v_target IS NULL THEN
      v_target := public.find_default_storage_bin();
    END IF;

    IF v_target IS NULL THEN
      RAISE NOTICE 'migrate_receiving_to_storage: no STORAGE bin; skipping warehouse_inventory %', r.id;
      CONTINUE;
    END IF;

    IF v_target = r.bin_id THEN
      UPDATE public.warehouse_inventory wi
      SET status = 'IN_STORAGE'::public.inventory_status,
          moved_to_storage_date = COALESCE(wi.moved_to_storage_date, now())
      WHERE wi.id = r.id;
      CONTINUE;
    END IF;

    v_merge_id := NULL;
    IF r.item_id IS NOT NULL THEN
      SELECT wi2.id
      INTO v_merge_id
      FROM public.warehouse_inventory wi2
      WHERE wi2.bin_id = v_target
        AND wi2.status = 'IN_STORAGE'::public.inventory_status
        AND wi2.unit IS NOT DISTINCT FROM r.unit
        AND wi2.item_type IS NOT DISTINCT FROM r.item_type
        AND wi2.item_id IS NOT DISTINCT FROM r.item_id
        AND wi2.id <> r.id
      LIMIT 1;
    END IF;

    IF v_merge_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables t
        WHERE t.table_schema = 'public'
          AND t.table_name = 'inventory_allocations'
      ) THEN
        UPDATE public.inventory_allocations ia
        SET warehouse_inventory_id = v_merge_id
        WHERE ia.warehouse_inventory_id = r.id;
      END IF;

      UPDATE public.warehouse_inventory wi
      SET quantity = wi.quantity + r.quantity,
          moved_to_storage_date = COALESCE(wi.moved_to_storage_date, now())
      WHERE wi.id = v_merge_id;

      DELETE FROM public.warehouse_inventory wi WHERE wi.id = r.id;
    ELSE
      UPDATE public.warehouse_inventory wi
      SET bin_id = v_target,
          status = 'IN_STORAGE'::public.inventory_status,
          moved_to_storage_date = COALESCE(wi.moved_to_storage_date, now())
      WHERE wi.id = r.id;
    END IF;
  END LOOP;
END $$;

-- 4) GRN approval: insert into STORAGE with IN_STORAGE; keep PO completion side-effect when present
CREATE OR REPLACE FUNCTION public.trg_grn_approved_insert_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_bin_id uuid;
  v_po_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status IN ('approved', 'partially_approved')
     AND COALESCE(OLD.status, '') IS DISTINCT FROM NEW.status THEN

    v_bin_id := public.find_default_storage_bin();

    IF v_bin_id IS NULL THEN
      RAISE NOTICE 'No STORAGE bin found. Skipping inventory insert for GRN %', NEW.id;
      RETURN NEW;
    END IF;

    INSERT INTO public.warehouse_inventory (
      grn_id,
      grn_item_id,
      item_type,
      item_id,
      item_name,
      item_code,
      quantity,
      unit,
      bin_id,
      status,
      notes,
      moved_to_storage_date
    )
    SELECT
      NEW.id,
      gi.id,
      CASE gi.item_type
        WHEN 'fabric' THEN 'FABRIC'::public.warehouse_item_type
        WHEN 'product' THEN 'PRODUCT'::public.warehouse_item_type
        ELSE 'ITEM'::public.warehouse_item_type
      END,
      gi.item_id,
      gi.item_name,
      COALESCE(fm.fabric_code, im.item_code, gi.item_name),
      COALESCE(gi.approved_quantity, 0),
      COALESCE(gi.unit_of_measure, 'pcs'),
      v_bin_id,
      'IN_STORAGE'::public.inventory_status,
      CONCAT('Auto-placed from GRN ', NEW.grn_number),
      now()
    FROM public.grn_items gi
    LEFT JOIN public.fabric_master fm ON gi.item_type = 'fabric' AND fm.id = gi.item_id
    LEFT JOIN public.item_master im ON gi.item_type <> 'fabric' AND im.id = gi.item_id
    WHERE gi.grn_id = NEW.id
      AND COALESCE(gi.approved_quantity, 0) > 0
      AND gi.quality_status = 'approved'
      AND NOT EXISTS (
        SELECT 1 FROM public.warehouse_inventory wi WHERE wi.grn_item_id = gi.id
      );

    SELECT po_id INTO v_po_id
    FROM public.grn_master
    WHERE id = NEW.id;

    IF v_po_id IS NOT NULL THEN
      BEGIN
        PERFORM public.check_and_update_po_completion(v_po_id);
      EXCEPTION
        WHEN undefined_function THEN
          NULL;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_after_grn_status_on_grn_master ON public.grn_master;
CREATE TRIGGER trg_after_grn_status_on_grn_master
AFTER UPDATE ON public.grn_master
FOR EACH ROW
EXECUTE FUNCTION public.trg_grn_approved_insert_inventory();
