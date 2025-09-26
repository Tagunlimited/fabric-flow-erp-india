-- Fix FK for warehouse_inventory.grn_id to reference grn_master
-- Harden trigger to avoid failures when no receiving bin exists
-- Compute item_code from source tables reliably

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'warehouse_inventory') THEN
    -- Drop old FK if it points to goods_receipt_notes
    BEGIN
      ALTER TABLE public.warehouse_inventory DROP CONSTRAINT IF EXISTS warehouse_inventory_grn_id_fkey;
    EXCEPTION WHEN undefined_object THEN
      -- ignore
    END;

    -- Re-create FK to grn_master if that table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'grn_master') THEN
      ALTER TABLE public.warehouse_inventory
        ADD CONSTRAINT warehouse_inventory_grn_id_fkey
        FOREIGN KEY (grn_id)
        REFERENCES public.grn_master(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Recreate trigger function with stronger item_code resolution and bin guard
CREATE OR REPLACE FUNCTION public.trg_grn_approved_insert_inventory()
RETURNS TRIGGER AS $$
DECLARE
  v_bin_id UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IN ('approved', 'partially_approved') AND COALESCE(OLD.status, '') <> NEW.status THEN
    v_bin_id := public.find_default_receiving_bin();

    -- If no receiving bin, skip instead of failing
    IF v_bin_id IS NULL THEN
      RAISE NOTICE 'No RECEIVING_ZONE bin found. Skipping inventory insert for GRN %', NEW.id;
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
      notes
    )
    SELECT
      NEW.id,
      gi.id,
      CASE gi.item_type
        WHEN 'fabric' THEN 'FABRIC'::warehouse_item_type
        WHEN 'product' THEN 'PRODUCT'::warehouse_item_type
        ELSE 'ITEM'::warehouse_item_type
      END,
      gi.item_id,
      gi.item_name,
      COALESCE(fm.fabric_code, im.item_code, gi.item_name),
      COALESCE(gi.approved_quantity, 0),
      COALESCE(gi.unit_of_measure, 'pcs'),
      v_bin_id,
      'RECEIVED'::inventory_status,
      CONCAT('Auto-placed from GRN ', NEW.grn_number)
    FROM public.grn_items gi
    LEFT JOIN public.fabric_master fm ON gi.item_type = 'fabric' AND fm.id = gi.item_id
    LEFT JOIN public.item_master im ON gi.item_type <> 'fabric' AND im.id = gi.item_id
    WHERE gi.grn_id = NEW.id
      AND COALESCE(gi.approved_quantity, 0) > 0
      AND gi.quality_status = 'approved'
      AND NOT EXISTS (
        SELECT 1 FROM public.warehouse_inventory wi WHERE wi.grn_item_id = gi.id
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure the trigger is present
DROP TRIGGER IF EXISTS trg_after_grn_status_on_grn_master ON public.grn_master;
CREATE TRIGGER trg_after_grn_status_on_grn_master
AFTER UPDATE ON public.grn_master
FOR EACH ROW
EXECUTE FUNCTION public.trg_grn_approved_insert_inventory();


