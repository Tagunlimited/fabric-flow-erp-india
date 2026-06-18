-- Prevent twin order creates: idempotency key + atomic order number allocation.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS create_idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_create_idempotency_key
  ON public.orders (create_idempotency_key)
  WHERE create_idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.orders.create_idempotency_key IS
  'Client-generated UUID per form session; duplicate insert with same key returns existing order instead of a new number.';

CREATE TABLE IF NOT EXISTS public.order_number_counters (
  prefix text NOT NULL,
  fy text NOT NULL,
  last_seq integer NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, fy)
);

-- Seed counters from existing orders (includes soft-deleted rows so numbers are not reused).
INSERT INTO public.order_number_counters (prefix, fy, last_seq)
SELECT
  upper(substring(o.order_number FROM '^(TUC|RMO)')) AS prefix,
  substring(o.order_number FROM '^(?:TUC|RMO)/([0-9]{2}-[0-9]{2})/') AS fy,
  max((substring(o.order_number FROM '/([0-9]+)$'))::integer) AS last_seq
FROM public.orders o
WHERE o.order_number ~ '^(TUC|RMO)/[0-9]{2}-[0-9]{2}/[0-9]+$'
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

  INSERT INTO public.order_number_counters (prefix, fy, last_seq)
  VALUES (v_prefix, v_fy, 1)
  ON CONFLICT (prefix, fy) DO UPDATE
    SET last_seq = public.order_number_counters.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN v_prefix || '/' || v_fy || '/' || lpad(v_seq::text, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_order_number(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
