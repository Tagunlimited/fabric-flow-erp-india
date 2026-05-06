-- Backfill FABRIC warehouse_inventory.item_id when NULL:
--   Pass A: purchase_order_items.fabric_id via grn_items.po_item_id
--   Pass B: unique fabric_master match on color + gsm + name, mirroring inventory UI identity
-- Also replaces GRN approval inventory insert to set item_id via COALESCE(gi.item_id, poi.fabric_id, unique match).
--
-- Spot-check (run before/after deploy):
--   SELECT COUNT(*) AS fabric_rows_missing_item_id
--   FROM public.warehouse_inventory wi
--   WHERE wi.item_type = 'FABRIC' AND wi.item_id IS NULL;
--
--   SELECT wi.id, wi.quantity, wi.bin_id, wi.grn_item_id, wi.item_name, wi.item_code
--   FROM public.warehouse_inventory wi
--   WHERE wi.item_type = 'FABRIC' AND wi.item_id IS NULL
--   LIMIT 50;

BEGIN;

-- Backfill/merge in one pass:
--   1) Resolve missing item_id from PO fabric_id OR unique color+gsm+name match.
--   2) If setting item_id would collide with ux_wh_fabric_variant_active, merge quantity into target,
--      move allocations, and delete source row.
DO $$
DECLARE
  r RECORD;
  v_target_id uuid;
BEGIN
  FOR r IN
    SELECT
      wi.id AS wi_id,
      wi.quantity AS wi_qty,
      wi.bin_id,
      wi.status,
      wi.unit,
      COALESCE(
        poi.fabric_id,
        (
          SELECT CASE WHEN COUNT(*) = 1 THEN (array_agg(candidates.id ORDER BY candidates.id))[1] ELSE NULL END
          FROM (
            SELECT fm.id
            FROM public.fabric_master fm
            WHERE LOWER(TRIM(COALESCE(fm.color, ''))) = LOWER(TRIM(COALESCE(gi.fabric_color, poi.fabric_color, '')))
              AND TRIM(COALESCE(fm.gsm::text, '')) = TRIM(COALESCE(gi.fabric_gsm, poi.fabric_gsm, '')::text)
              AND COALESCE(TRIM(COALESCE(gi.fabric_name, poi.fabric_name, gi.item_name, wi.item_name, '')), '') <> ''
              AND LOWER(TRIM(COALESCE(fm.fabric_name, ''))) = LOWER(TRIM(COALESCE(gi.fabric_name, poi.fabric_name, gi.item_name, wi.item_name, '')))
          ) candidates
        )
      ) AS resolved_id
    FROM public.warehouse_inventory wi
    INNER JOIN public.grn_items gi ON gi.id = wi.grn_item_id
    LEFT JOIN public.purchase_order_items poi ON poi.id = gi.po_item_id
    WHERE wi.item_type = 'FABRIC'
      AND wi.item_id IS NULL
  LOOP
    IF r.resolved_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT wi2.id
    INTO v_target_id
    FROM public.warehouse_inventory wi2
    WHERE wi2.item_type = 'FABRIC'
      AND wi2.item_id = r.resolved_id
      AND wi2.bin_id IS NOT DISTINCT FROM r.bin_id
      AND wi2.status IS NOT DISTINCT FROM r.status
      AND wi2.unit IS NOT DISTINCT FROM r.unit
      AND wi2.id <> r.wi_id
    LIMIT 1;

    IF v_target_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables t
        WHERE t.table_schema = 'public'
          AND t.table_name = 'inventory_allocations'
      ) THEN
        UPDATE public.inventory_allocations ia
        SET warehouse_inventory_id = v_target_id
        WHERE ia.warehouse_inventory_id = r.wi_id;
      END IF;

      UPDATE public.warehouse_inventory wi
      SET quantity = COALESCE(wi.quantity, 0) + COALESCE(r.wi_qty, 0),
          updated_at = NOW()
      WHERE wi.id = v_target_id;

      DELETE FROM public.warehouse_inventory wi
      WHERE wi.id = r.wi_id;
    ELSE
      UPDATE public.warehouse_inventory wi
      SET item_id = r.resolved_id,
          updated_at = NOW()
      WHERE wi.id = r.wi_id
        AND wi.item_id IS NULL;
    END IF;
  END LOOP;
END $$;

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
      CASE
        WHEN gi.item_type = 'fabric' THEN
          COALESCE(
            gi.item_id,
            poi.fabric_id,
            (
              SELECT CASE WHEN COUNT(*) = 1 THEN (array_agg(candidates.id ORDER BY candidates.id))[1] ELSE NULL END
              FROM (
                SELECT fmx.id
                FROM public.fabric_master fmx
                WHERE LOWER(TRIM(COALESCE(fmx.color, ''))) = LOWER(TRIM(COALESCE(gi.fabric_color, poi.fabric_color, '')))
                  AND TRIM(COALESCE(fmx.gsm::text, '')) = TRIM(COALESCE(gi.fabric_gsm, poi.fabric_gsm, '')::text)
                  AND COALESCE(TRIM(COALESCE(gi.fabric_name, poi.fabric_name, gi.item_name, '')), '') <> ''
                  AND LOWER(TRIM(COALESCE(fmx.fabric_name, ''))) = LOWER(TRIM(COALESCE(gi.fabric_name, poi.fabric_name, gi.item_name, '')))
              ) candidates
            )
          )
        ELSE gi.item_id
      END,
      gi.item_name,
      COALESCE(fm.fabric_code, im.item_code, gi.item_name),
      COALESCE(gi.approved_quantity, 0),
      COALESCE(gi.unit_of_measure, 'pcs'),
      v_bin_id,
      'IN_STORAGE'::public.inventory_status,
      CONCAT('Auto-placed from GRN ', NEW.grn_number),
      now()
    FROM public.grn_items gi
    LEFT JOIN public.purchase_order_items poi ON poi.id = gi.po_item_id
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

COMMIT;
