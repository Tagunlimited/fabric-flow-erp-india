-- Per-order extra charges (transportation, etc.) shown on custom order form and detail page
CREATE TABLE IF NOT EXISTS public.order_additional_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  particular TEXT NOT NULL DEFAULT '',
  rate NUMERIC(12, 2) NOT NULL DEFAULT 0,
  gst_percentage NUMERIC(8, 2) NOT NULL DEFAULT 0,
  amount_incl_gst NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_additional_charges_order_id
  ON public.order_additional_charges(order_id);

COMMENT ON TABLE public.order_additional_charges IS 'Additional line charges (e.g. transport) for an order; amounts include GST.';

ALTER TABLE public.order_additional_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access to order_additional_charges" ON public.order_additional_charges;
CREATE POLICY "Allow authenticated full access to order_additional_charges"
  ON public.order_additional_charges
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
