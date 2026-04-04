-- Allow manual / opening-balance rows in warehouse_inventory without a GRN line.
-- Safe to re-run: DROP NOT NULL is idempotent for already-nullable columns.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'warehouse_inventory'
      AND column_name = 'grn_id'
  ) THEN
    ALTER TABLE public.warehouse_inventory ALTER COLUMN grn_id DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'warehouse_inventory'
      AND column_name = 'grn_item_id'
  ) THEN
    ALTER TABLE public.warehouse_inventory ALTER COLUMN grn_item_id DROP NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.warehouse_inventory.grn_id IS
  'Optional link to grn_master; NULL for manual or opening stock.';
COMMENT ON COLUMN public.warehouse_inventory.grn_item_id IS
  'Optional link to grn_items; NULL for manual or opening stock.';
