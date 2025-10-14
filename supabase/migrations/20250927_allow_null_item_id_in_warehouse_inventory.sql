-- Make warehouse_inventory.item_id nullable to allow GRN items without a master item reference
-- Safe to re-run

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'warehouse_inventory'
      AND column_name = 'item_id'
  ) THEN
    -- Drop NOT NULL constraint if present
    BEGIN
      ALTER TABLE public.warehouse_inventory
        ALTER COLUMN item_id DROP NOT NULL;
    EXCEPTION WHEN others THEN
      -- Ignore if already nullable or if constraint does not exist
      NULL;
    END;

    -- Document why this column is nullable
    COMMENT ON COLUMN public.warehouse_inventory.item_id IS
      'Nullable reference to fabric_master/item_master; can be NULL for custom or ad-hoc items received via GRN.';
  END IF;
END $$;


