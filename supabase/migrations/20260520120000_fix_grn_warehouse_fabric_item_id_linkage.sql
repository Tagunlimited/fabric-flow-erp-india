-- Link GRN warehouse fabric rows to fabric_master.id so Cutting Manager sees stock.
-- Backfills grn_items + warehouse_inventory; future GRN approvals use PO fabric_id when item_id is null.

UPDATE public.grn_items gi
SET item_id = poi.fabric_id
FROM public.purchase_order_items poi
WHERE gi.po_item_id = poi.id
  AND gi.item_type = 'fabric'
  AND poi.fabric_id IS NOT NULL
  AND (gi.item_id IS NULL OR gi.item_id::text = '' OR gi.item_id IS DISTINCT FROM poi.fabric_id);

UPDATE public.warehouse_inventory wi
SET item_id = poi.fabric_id
FROM public.grn_items gi
JOIN public.purchase_order_items poi ON poi.id = gi.po_item_id
WHERE wi.grn_item_id = gi.id
  AND wi.item_type = 'FABRIC'
  AND poi.fabric_id IS NOT NULL
  AND (wi.item_id IS NULL OR wi.item_id::text = '' OR wi.item_id IS DISTINCT FROM poi.fabric_id);

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
      COALESCE(gi.item_id, poi.fabric_id, fm.id),
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
    LEFT JOIN public.fabric_master fm ON gi.item_type = 'fabric' AND fm.id = COALESCE(gi.item_id, poi.fabric_id)
    LEFT JOIN public.item_master im ON gi.item_type <> 'fabric' AND im.id = gi.item_id
    WHERE gi.grn_id = NEW.id
      AND COALESCE(gi.approved_quantity, 0) > 0
      AND gi.quality_status = 'approved'
      AND COALESCE(gi.item_id, poi.fabric_id, fm.id) IS NOT NULL
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
