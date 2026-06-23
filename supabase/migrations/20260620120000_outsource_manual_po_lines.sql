-- Outsource manual PO lines: free-text product, size breakdown, per-size GRN.

ALTER TABLE public.purchase_order_items
  ALTER COLUMN item_id DROP NOT NULL;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS size_type_id uuid REFERENCES public.size_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sizes_quantities jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS entry_mode text;

COMMENT ON COLUMN public.purchase_order_items.size_type_id IS 'Size master for outsource manual PO lines.';
COMMENT ON COLUMN public.purchase_order_items.sizes_quantities IS 'Per-size ordered qty for outsource manual PO lines.';
COMMENT ON COLUMN public.purchase_order_items.entry_mode IS 'outsource_manual when entered via outsource PO panel; null for legacy/BOM lines.';

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_entry_mode
  ON public.purchase_order_items (entry_mode)
  WHERE entry_mode IS NOT NULL;

ALTER TABLE public.grn_items
  ADD COLUMN IF NOT EXISTS size_name text;

COMMENT ON COLUMN public.grn_items.size_name IS 'Size label for per-size outsource GRN rows; null for legacy single-line receipt.';

-- Allow GRN rows without inventory master id (finished outsource goods).
ALTER TABLE public.grn_items
  ALTER COLUMN item_id DROP NOT NULL;
