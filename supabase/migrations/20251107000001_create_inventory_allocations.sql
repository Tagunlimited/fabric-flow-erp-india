-- Inventory allocations for BOM items

CREATE TABLE IF NOT EXISTS public.inventory_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_inventory_id UUID NOT NULL REFERENCES public.warehouse_inventory(id) ON DELETE CASCADE,
  bom_id UUID REFERENCES public.bom_records(id) ON DELETE SET NULL,
  bom_item_id UUID REFERENCES public.bom_record_items(id) ON DELETE SET NULL,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity >= 0),
  unit TEXT DEFAULT 'pcs',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_inventory_allocations_warehouse_inventory_id
  ON public.inventory_allocations(warehouse_inventory_id);

CREATE INDEX IF NOT EXISTS idx_inventory_allocations_bom_item_id
  ON public.inventory_allocations(bom_item_id);

ALTER TABLE public.inventory_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_allocations_select" ON public.inventory_allocations;
DROP POLICY IF EXISTS "inventory_allocations_modify" ON public.inventory_allocations;

CREATE POLICY "inventory_allocations_select" ON public.inventory_allocations
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "inventory_allocations_modify" ON public.inventory_allocations
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

GRANT ALL ON public.inventory_allocations TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_allocations TO authenticated;

CREATE OR REPLACE VIEW public.warehouse_inventory_allocation_summary AS
SELECT
  wi.id AS warehouse_inventory_id,
  COALESCE(SUM(ia.quantity), 0) AS allocated_quantity
FROM public.warehouse_inventory wi
LEFT JOIN public.inventory_allocations ia ON ia.warehouse_inventory_id = wi.id
GROUP BY wi.id;

GRANT SELECT ON public.warehouse_inventory_allocation_summary TO anon, authenticated, service_role;

