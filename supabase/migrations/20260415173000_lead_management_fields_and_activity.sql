-- Add lead assignment/status/remark fields and activity log for CRM leads.

DO $$
BEGIN
  IF to_regclass('public.contact_submissions') IS NULL THEN
    RAISE NOTICE 'public.contact_submissions does not exist, skipping lead management migration.';
    RETURN;
  END IF;

  ALTER TABLE public.contact_submissions
    ADD COLUMN IF NOT EXISTS assigned_sales_manager uuid,
    ADD COLUMN IF NOT EXISTS lead_status text,
    ADD COLUMN IF NOT EXISTS lead_remark text,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

  -- Keep status values controlled.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contact_submissions_lead_status_check'
  ) THEN
    ALTER TABLE public.contact_submissions
      ADD CONSTRAINT contact_submissions_lead_status_check
      CHECK (
        lead_status IS NULL OR
        lead_status IN ('contacted', 'not_interested', 'negotiation', 'converted')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contact_submissions_assigned_sales_manager
  ON public.contact_submissions (assigned_sales_manager);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_lead_status
  ON public.contact_submissions (lead_status);

CREATE TABLE IF NOT EXISTS public.lead_status_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL,
  status text,
  sales_manager_id uuid,
  remark text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF to_regclass('public.employees') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'lead_status_activities_sales_manager_id_fkey'
    ) THEN
    ALTER TABLE public.lead_status_activities
      ADD CONSTRAINT lead_status_activities_sales_manager_id_fkey
      FOREIGN KEY (sales_manager_id)
      REFERENCES public.employees(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lead_status_activities_status_check'
  ) THEN
    ALTER TABLE public.lead_status_activities
      ADD CONSTRAINT lead_status_activities_status_check
      CHECK (
        status IS NULL OR
        status IN ('contacted', 'not_interested', 'negotiation', 'converted')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lead_status_activities_lead_id_created_at
  ON public.lead_status_activities (lead_id, created_at DESC);

ALTER TABLE public.lead_status_activities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lead_status_activities'
      AND policyname = 'lead_status_activities_authenticated_all'
  ) THEN
    CREATE POLICY lead_status_activities_authenticated_all
      ON public.lead_status_activities
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

