-- Expected date for collecting remaining order balance; set when recording a credit (₹0) receipt (staff-chosen due date).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_due_date DATE;

COMMENT ON COLUMN public.orders.payment_due_date IS 'Target date for payment of outstanding balance; typically set when a credit acknowledgement receipt is created. Overwritten on each new credit receipt for the order.';

CREATE INDEX IF NOT EXISTS idx_orders_payment_due_date ON public.orders(payment_due_date)
  WHERE payment_due_date IS NOT NULL;
