-- Standalone guard: enables Order flow assignment toggle when the larger fulfillment migration
-- has not been applied yet on a given database. Safe to run if column already exists.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS require_order_flow_assignment boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.company_settings.require_order_flow_assignment IS
  'When true, creating a receipt sets order lines to pending_flow until assign_order_item_flows is called.';

NOTIFY pgrst, 'reload schema';
