-- Delivery challan numbers must be unique and monotonic per Indian FY (Apr–Mar),
-- matching app format TUC/<FY>/DC/0001. Client-side MAX + insert races RLS-hidden
-- soft-deleted rows. Assign inside the DB under advisory lock instead.

DROP TRIGGER IF EXISTS trigger_set_dispatch_number ON public.dispatch_orders;
DROP TRIGGER IF EXISTS trigger_assign_tuc_dispatch_challan_number ON public.dispatch_orders;
DROP FUNCTION IF EXISTS public.set_dispatch_number();
DROP FUNCTION IF EXISTS public.generate_dispatch_number();

CREATE OR REPLACE FUNCTION public.assign_tuc_dispatch_challan_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date;
  y int;
  m int;
  fy_start int;
  fy_label text;
  prefix text;
  maxn int := 0;
BEGIN
  IF NEW.dispatch_number IS NOT NULL AND length(trim(NEW.dispatch_number)) > 0 THEN
    RETURN NEW;
  END IF;

  d := (timezone('Asia/Kolkata', clock_timestamp()))::date;
  y := EXTRACT(YEAR FROM d)::int;
  m := EXTRACT(MONTH FROM d)::int;
  fy_start := CASE WHEN m < 4 THEN y - 1 ELSE y END;
  fy_label := fy_start::text || '-' || lpad((mod(fy_start + 1, 100))::text, 2, '0');
  prefix := 'TUC/' || fy_label || '/DC/';

  PERFORM pg_advisory_xact_lock(hashtext('tuc_dispatch_challan:' || prefix));

  SELECT COALESCE(MAX((regexp_match(dispatch_number, '/(\d+)$'))[1]::int), 0)
  INTO maxn
  FROM public.dispatch_orders
  WHERE dispatch_number ILIKE prefix || '%'
    AND dispatch_number ~ '/[0-9]+$';

  NEW.dispatch_number := prefix || lpad((maxn + 1)::text, 4, '0');
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.assign_tuc_dispatch_challan_number() OWNER TO postgres;

CREATE TRIGGER trigger_assign_tuc_dispatch_challan_number
  BEFORE INSERT ON public.dispatch_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_tuc_dispatch_challan_number();
