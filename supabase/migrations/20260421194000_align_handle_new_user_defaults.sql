-- Align auth signup trigger metadata handling and safe defaults.
-- Accept both `full_name` and legacy `name`, normalize role safely,
-- and default status to pending approval.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_status text;
  v_role text;
BEGIN
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.email
  );

  v_status := COALESCE(NEW.raw_user_meta_data->>'status', 'pending_approval');
  IF v_status NOT IN ('pending_approval', 'approved', 'rejected') THEN
    v_status := 'pending_approval';
  END IF;

  v_role := CASE lower(trim(COALESCE(NEW.raw_user_meta_data->>'role', '')))
    WHEN 'admin' THEN 'admin'
    WHEN 'sales' THEN 'sales manager'
    WHEN 'sales manager' THEN 'sales manager'
    WHEN 'production' THEN 'production manager'
    WHEN 'production manager' THEN 'production manager'
    WHEN 'quality' THEN 'qc manager'
    WHEN 'qc' THEN 'qc manager'
    WHEN 'qc manager' THEN 'qc manager'
    WHEN 'dispatch' THEN 'packaging & dispatch manager'
    WHEN 'packaging & dispatch manager' THEN 'packaging & dispatch manager'
    WHEN 'graphic & printing' THEN 'graphic & printing'
    WHEN 'procurement manager' THEN 'procurement manager'
    WHEN 'cutting master' THEN 'cutting master'
    WHEN 'customer' THEN 'customer'
    ELSE 'sales manager'
  END;

  INSERT INTO public.profiles (
    user_id,
    full_name,
    email,
    role,
    phone,
    department,
    status
  )
  VALUES (
    NEW.id,
    v_name,
    NEW.email,
    v_role::public.user_role,
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    NULLIF(NEW.raw_user_meta_data->>'department', ''),
    v_status
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
