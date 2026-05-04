-- Track physical printing completion separately from design/mockup completion (Design page).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS printing_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.printing_completed_at IS
  'When set, printing queue is done for this order. Null means printing pending after design work is complete.';

CREATE INDEX IF NOT EXISTS idx_orders_printing_completed_at
  ON public.orders (printing_completed_at)
  WHERE printing_completed_at IS NOT NULL;
