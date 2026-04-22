-- Add audit + repair helpers for users unintentionally downgraded to sales manager.

CREATE TABLE IF NOT EXISTS public.profile_role_repair_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  old_role text NOT NULL,
  new_role text NOT NULL,
  reason text NOT NULL,
  repaired_by uuid,
  repaired_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_role_repair_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read profile role repair audit" ON public.profile_role_repair_audit;
CREATE POLICY "Admins can read profile role repair audit"
ON public.profile_role_repair_audit
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins can insert profile role repair audit" ON public.profile_role_repair_audit;
CREATE POLICY "Admins can insert profile role repair audit"
ON public.profile_role_repair_audit
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'admin'
  )
);

CREATE OR REPLACE VIEW public.suspicious_profile_role_downgrades AS
SELECT
  p.user_id,
  p.email,
  p.full_name,
  p.role AS profile_role,
  p.status,
  p.updated_at,
  max(r.name) FILTER (WHERE lower(r.name) = 'admin') AS matched_role_name
FROM public.profiles p
LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
LEFT JOIN public.roles r ON r.id = ur.role_id
WHERE p.role = 'sales manager'
GROUP BY p.user_id, p.email, p.full_name, p.role, p.status, p.updated_at
HAVING bool_or(lower(coalesce(r.name, '')) = 'admin');

CREATE OR REPLACE FUNCTION public.repair_downgraded_admin_profiles(p_dry_run boolean DEFAULT true)
RETURNS TABLE (
  user_id uuid,
  email text,
  old_role text,
  new_role text,
  action text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := auth.uid();
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = v_actor
      AND p.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions. Admin access required.';
  END IF;

  IF p_dry_run THEN
    RETURN QUERY
    SELECT s.user_id, s.email, 'sales manager'::text, 'admin'::text, 'dry_run'::text
    FROM public.suspicious_profile_role_downgrades s;
    RETURN;
  END IF;

  RETURN QUERY
  WITH targets AS (
    SELECT s.user_id, s.email
    FROM public.suspicious_profile_role_downgrades s
  ),
  updated AS (
    UPDATE public.profiles p
    SET role = 'admin',
        updated_at = now()
    FROM targets t
    WHERE p.user_id = t.user_id
      AND p.role = 'sales manager'
    RETURNING p.user_id, p.email
  ),
  audited AS (
    INSERT INTO public.profile_role_repair_audit (user_id, old_role, new_role, reason, repaired_by)
    SELECT u.user_id, 'sales manager', 'admin', 'auto-repair based on user_roles admin mapping', v_actor
    FROM updated u
    RETURNING user_id
  )
  SELECT u.user_id, u.email, 'sales manager'::text, 'admin'::text, 'repaired'::text
  FROM updated u;
END;
$$;

GRANT SELECT ON public.suspicious_profile_role_downgrades TO authenticated;
GRANT EXECUTE ON FUNCTION public.repair_downgraded_admin_profiles(boolean) TO authenticated;
