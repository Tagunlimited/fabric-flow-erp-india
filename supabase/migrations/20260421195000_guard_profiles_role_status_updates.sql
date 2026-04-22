-- Guard privileged profile mutations.
-- Only admins can change profile role or approve/reject users.

CREATE OR REPLACE FUNCTION public.enforce_profiles_privileged_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_is_admin boolean;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = v_actor
      AND p.role = 'admin'
  ) INTO v_is_admin;

  IF (NEW.role IS DISTINCT FROM OLD.role) AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can change profile roles';
  END IF;

  IF (NEW.status IS DISTINCT FROM OLD.status) AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can change profile status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profiles_privileged_changes ON public.profiles;
CREATE TRIGGER trg_enforce_profiles_privileged_changes
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profiles_privileged_changes();
