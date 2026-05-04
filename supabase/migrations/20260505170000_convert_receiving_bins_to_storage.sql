-- Warehouse Master cleanup: remove receiving-bin concept.
-- Convert all legacy RECEIVING_ZONE bins to STORAGE.
-- Safe to re-run.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bins'
      AND column_name = 'location_type'
  ) THEN
    UPDATE public.bins
    SET location_type = 'STORAGE'::public.location_type
    WHERE location_type = 'RECEIVING_ZONE'::public.location_type;
  END IF;
END $$;

