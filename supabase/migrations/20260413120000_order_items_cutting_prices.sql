-- Per-order-line cutting/stitching rates (SN + OF). When NULL, consumers fall back to order_assignments.cutting_price_*.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS cutting_price_single_needle numeric(10,2),
  ADD COLUMN IF NOT EXISTS cutting_price_overlock_flatlock numeric(10,2);

COMMENT ON COLUMN public.order_items.cutting_price_single_needle IS
  'Per-piece single-needle rate for this line; NULL = use order_assignments.cutting_price_single_needle';
COMMENT ON COLUMN public.order_items.cutting_price_overlock_flatlock IS
  'Per-piece overlock/flatlock rate for this line; NULL = use order_assignments.cutting_price_overlock_flatlock';

-- order_assignments.total_cutting_cost trigger (if present) remains order-level only; line-level rates affect job cards via application logic.
