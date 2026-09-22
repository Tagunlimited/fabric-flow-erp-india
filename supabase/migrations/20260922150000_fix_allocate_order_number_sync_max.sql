-- Fix duplicate order_number on create: counter can lag behind existing orders
-- (especially legacy TUC/FY/MON/NNN numbers that were excluded from the original seed).

-- Re-seed counters from every FY serial (plain + month-segment formats).
INSERT INTO public.order_number_counters (prefix, fy, last_seq)
SELECT
  upper(substring(o.order_number FROM '^(TUC|RMO)')) AS prefix,
  substring(o.order_number FROM '^(?:TUC|RMO)/([0-9]{2}-[0-9]{2})/') AS fy,
  max((substring(o.order_number FROM '/([0-9]+)$'))::integer) AS last_seq
FROM public.orders o
WHERE o.order_number ~ '^(TUC|RMO)/[0-9]{2}-[0-9]{2}(/[A-Z]{3})?/[0-9]+$'
GROUP BY 1, 2
ON CONFLICT (prefix, fy) DO UPDATE
  SET last_seq = GREATEST(public.order_number_counters.last_seq, EXCLUDED.last_seq);

CREATE OR REPLACE FUNCTION public.allocate_order_number(p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_fy text;
  v_seq integer;
  v_max_existing integer;
BEGIN
  v_prefix := upper(trim(coalesce(p_prefix, '')));
  IF v_prefix NOT IN ('TUC', 'RMO') THEN
    RAISE EXCEPTION 'p_prefix must be TUC or RMO';
  END IF;

  IF EXTRACT(MONTH FROM CURRENT_DATE) < 4 THEN
    v_fy :=
      to_char(date_trunc('year', CURRENT_DATE) - interval '1 year', 'YY')
      || '-'
      || to_char(date_trunc('year', CURRENT_DATE), 'YY');
  ELSE
    v_fy :=
      to_char(date_trunc('year', CURRENT_DATE), 'YY')
      || '-'
      || to_char(date_trunc('year', CURRENT_DATE) + interval '1 year', 'YY');
  END IF;

  -- Include soft-deleted rows so unique order_number values are never reused.
  SELECT COALESCE(MAX((substring(o.order_number FROM '/([0-9]+)$'))::integer), 0)
  INTO v_max_existing
  FROM public.orders o
  WHERE o.order_number ~ ('^' || v_prefix || '/' || v_fy || '(/[A-Z]{3})?/[0-9]+$');

  INSERT INTO public.order_number_counters (prefix, fy, last_seq)
  VALUES (v_prefix, v_fy, v_max_existing + 1)
  ON CONFLICT (prefix, fy) DO UPDATE
    SET last_seq = GREATEST(public.order_number_counters.last_seq, v_max_existing) + 1
  RETURNING last_seq INTO v_seq;

  RETURN v_prefix || '/' || v_fy || '/' || lpad(v_seq::text, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_order_number(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
