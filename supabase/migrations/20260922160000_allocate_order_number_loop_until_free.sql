-- Bulletproof order-number allocation: never return a number that already exists.
-- Fixes live "duplicate key value violates unique constraint orders_order_number_key"
-- even when the counter table is wrong or FY max lookup previously returned 0.

-- Drop legacy auto-number trigger that can race / conflict with allocate_order_number.
DROP TRIGGER IF EXISTS trigger_set_order_number ON public.orders;

CREATE TABLE IF NOT EXISTS public.order_number_counters (
  prefix text NOT NULL,
  fy text NOT NULL,
  last_seq integer NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, fy)
);

-- Force counter up to real max for current data (plain + legacy month formats).
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
  v_candidate text;
  v_attempts integer := 0;
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

  -- Serialize all allocators for this prefix+FY (transaction-scoped).
  PERFORM pg_advisory_xact_lock(
    hashtext('allocate_order_number:' || v_prefix || ':' || v_fy)
  );

  -- LIKE matches TUC/26-27/970 and legacy TUC/26-27/APR/059.
  SELECT COALESCE(MAX((substring(o.order_number FROM '/([0-9]+)$'))::integer), 0)
  INTO v_max_existing
  FROM public.orders o
  WHERE o.order_number LIKE (v_prefix || '/' || v_fy || '/%');

  INSERT INTO public.order_number_counters (prefix, fy, last_seq)
  VALUES (v_prefix, v_fy, v_max_existing)
  ON CONFLICT (prefix, fy) DO UPDATE
    SET last_seq = GREATEST(public.order_number_counters.last_seq, EXCLUDED.last_seq);

  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 10000 THEN
      RAISE EXCEPTION 'allocate_order_number: could not find free number for %/%', v_prefix, v_fy;
    END IF;

    UPDATE public.order_number_counters
    SET last_seq = last_seq + 1
    WHERE prefix = v_prefix AND fy = v_fy
    RETURNING last_seq INTO v_seq;

    v_candidate := v_prefix || '/' || v_fy || '/' || lpad(v_seq::text, 3, '0');

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.orders o WHERE o.order_number = v_candidate
    );
  END LOOP;

  RETURN v_candidate;
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_order_number(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
