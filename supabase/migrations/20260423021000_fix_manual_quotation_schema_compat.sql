-- Compatibility patch for environments created before manual quotation rollout.
-- Keeps order linkage nullable and additive-only.

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS order_number TEXT;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'automatic';

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS manual_quotation_id UUID REFERENCES public.manual_quotations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_order_id ON public.quotations(order_id);
CREATE INDEX IF NOT EXISTS idx_quotations_order_number ON public.quotations(order_number);
CREATE INDEX IF NOT EXISTS idx_quotations_source ON public.quotations(source);
CREATE INDEX IF NOT EXISTS idx_quotations_manual_quotation_id ON public.quotations(manual_quotation_id);
