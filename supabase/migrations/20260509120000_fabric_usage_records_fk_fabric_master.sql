BEGIN;

-- ISSUE: Inserts into fabric_usage_records fail with FK violation on fabric_id.
-- REASON: Column was defined as REFERENCES fabrics(id), but the app and
--         consume_fabric_for_cutting() use fabric_master.id everywhere.
-- RESOLUTION: Point fabric_usage_records.fabric_id at fabric_master(id).

-- Drop any FK on fabric_id (name may differ across DBs).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.fabric_usage_records'::regclass
      AND c.contype = 'f'
      AND a.attname = 'fabric_id'
  LOOP
    EXECUTE format('ALTER TABLE public.fabric_usage_records DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- Legacy rows may hold fabrics-table UUIDs; those are not valid fabric_master ids.
UPDATE public.fabric_usage_records fur
SET fabric_id = NULL
WHERE fabric_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.fabric_master fm WHERE fm.id = fur.fabric_id
  );

ALTER TABLE public.fabric_usage_records
  ADD CONSTRAINT fabric_usage_records_fabric_id_fkey
  FOREIGN KEY (fabric_id) REFERENCES public.fabric_master(id) ON DELETE SET NULL;

COMMIT;
