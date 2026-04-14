-- Optional link from HR row (employees) to Supabase auth user.
-- Frontend uses user_id + personal_email for "My orders" / sales-manager filters.
-- Core schema (20251007235958) had personal_email but not user_id.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_user_id ON public.employees (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.employees.user_id IS 'Auth user linked to this employee record, when applicable.';
