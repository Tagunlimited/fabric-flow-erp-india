-- Multi-path fulfillment: enums, order_items columns, assignment tables, procurement queue view, PO linkage.

-- 1) Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_item_execution_flow') THEN
    CREATE TYPE public.order_item_execution_flow AS ENUM (
      'stitching',
      'outsource',
      'inventory'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_item_fulfillment_status') THEN
    CREATE TYPE public.order_item_fulfillment_status AS ENUM (
      'pending_flow',
      'flow_assigned',
      'awaiting_procurement',
      'awaiting_production',
      'awaiting_dispatch_prep',
      'ready_for_dispatch',
      'dispatched',
      'cancelled'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_item_inventory_commitment_state') THEN
    CREATE TYPE public.order_item_inventory_commitment_state AS ENUM (
      'reserved',
      'released',
      'consumed'
    );
  END IF;
END $$;

-- 2) Order status rollup value
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'pending_flow_assignment';

-- 3) company_settings feature flag
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS require_order_flow_assignment boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.company_settings.require_order_flow_assignment IS
  'When true, creating a receipt sets order lines to pending_flow until assign_order_item_flows is called.';

-- 4) order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS execution_flow public.order_item_execution_flow,
  ADD COLUMN IF NOT EXISTS fulfillment_status public.order_item_fulfillment_status NOT NULL DEFAULT 'flow_assigned',
  ADD COLUMN IF NOT EXISTS flow_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS flow_assigned_by uuid,
  ADD COLUMN IF NOT EXISTS flow_notes text;

COMMENT ON COLUMN public.order_items.execution_flow IS 'NULL until user assigns a path (when using flow assignment gate).';
COMMENT ON COLUMN public.order_items.fulfillment_status IS 'Per-line fulfillment lifecycle.';

CREATE INDEX IF NOT EXISTS idx_order_items_order_fulfillment
  ON public.order_items (order_id, fulfillment_status);

CREATE INDEX IF NOT EXISTS idx_order_items_execution_flow
  ON public.order_items (execution_flow)
  WHERE execution_flow IS NOT NULL;

-- 5) Assignment history
CREATE TABLE IF NOT EXISTS public.order_item_flow_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  execution_flow public.order_item_execution_flow NOT NULL,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  supersedes_assignment_id uuid REFERENCES public.order_item_flow_assignments(id) ON DELETE SET NULL,
  reason text
);

CREATE INDEX IF NOT EXISTS idx_order_item_flow_assignments_item
  ON public.order_item_flow_assignments (order_item_id, assigned_at DESC);

ALTER TABLE public.order_item_flow_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_item_flow_assignments_all" ON public.order_item_flow_assignments;
CREATE POLICY "order_item_flow_assignments_all" ON public.order_item_flow_assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_item_flow_assignments TO authenticated, service_role;

-- 6) Inventory commitments (order line -> warehouse rows)
CREATE TABLE IF NOT EXISTS public.order_item_inventory_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  warehouse_inventory_id uuid NOT NULL REFERENCES public.warehouse_inventory(id) ON DELETE RESTRICT,
  quantity numeric(14, 4) NOT NULL CHECK (quantity > 0),
  state public.order_item_inventory_commitment_state NOT NULL DEFAULT 'reserved',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  released_at timestamptz,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_order_item_inv_commit_item
  ON public.order_item_inventory_commitments (order_item_id);

CREATE INDEX IF NOT EXISTS idx_order_item_inv_commit_wi
  ON public.order_item_inventory_commitments (warehouse_inventory_id)
  WHERE state = 'reserved';

ALTER TABLE public.order_item_inventory_commitments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_item_inventory_commitments_all" ON public.order_item_inventory_commitments;
CREATE POLICY "order_item_inventory_commitments_all" ON public.order_item_inventory_commitments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_item_inventory_commitments TO authenticated, service_role;

-- 7) Append-only fulfillment events (optional audit)
CREATE TABLE IF NOT EXISTS public.order_fulfillment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS idx_order_fulfillment_events_order
  ON public.order_fulfillment_events (order_id, created_at DESC);

ALTER TABLE public.order_fulfillment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_fulfillment_events_all" ON public.order_fulfillment_events;
CREATE POLICY "order_fulfillment_events_all" ON public.order_fulfillment_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_fulfillment_events TO authenticated, service_role;

-- 8) Purchase order linkage for outsource / traceability
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS sales_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS sales_order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_sales_order
  ON public.purchase_orders (sales_order_id)
  WHERE sales_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_sales_order_item
  ON public.purchase_order_items (sales_order_item_id)
  WHERE sales_order_item_id IS NOT NULL;

-- Dispatch line linkage (optional; used for flow-aware validation)
ALTER TABLE public.dispatch_order_items
  ADD COLUMN IF NOT EXISTS order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dispatch_order_items_order_item
  ON public.dispatch_order_items (order_item_id)
  WHERE order_item_id IS NOT NULL;

-- 9) Procurement queue: orders with receipt, flag on, and any line still pending_flow
CREATE OR REPLACE VIEW public.v_orders_pending_flow_assignment AS
SELECT
  o.id AS order_id,
  o.order_number,
  o.order_date,
  o.order_type,
  o.status AS order_status,
  o.customer_id,
  c.company_name AS customer_name,
  o.created_at,
  (SELECT count(*)::int FROM public.order_items oi WHERE oi.order_id = o.id) AS line_count,
  (SELECT count(*)::int
   FROM public.order_items oi2
   WHERE oi2.order_id = o.id
     AND oi2.fulfillment_status = 'pending_flow') AS pending_line_count
FROM public.orders o
LEFT JOIN public.customers c ON c.id = o.customer_id
WHERE coalesce(o.is_deleted, false) = false
  AND o.status <> 'cancelled'
  AND EXISTS (SELECT 1 FROM public.company_settings cs WHERE cs.require_order_flow_assignment = true LIMIT 1)
  AND EXISTS (
    SELECT 1
    FROM public.receipts r
    WHERE (
      lower(coalesce(r.reference_type, '')) = 'order' AND r.reference_id = o.id
    )
    OR (
      r.reference_number IS NOT NULL AND r.reference_number = o.order_number
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.order_items oi
    WHERE oi.order_id = o.id
      AND oi.fulfillment_status = 'pending_flow'
  );

GRANT SELECT ON public.v_orders_pending_flow_assignment TO authenticated, service_role;

COMMENT ON VIEW public.v_orders_pending_flow_assignment IS
  'Orders that need per-line execution flow assignment (when require_order_flow_assignment is enabled).';
