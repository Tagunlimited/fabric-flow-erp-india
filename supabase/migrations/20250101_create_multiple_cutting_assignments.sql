-- Create table for multiple cutting master assignments per order
CREATE TABLE IF NOT EXISTS public.order_cutting_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  cutting_master_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  cutting_master_name TEXT NOT NULL,
  cutting_master_avatar_url TEXT,
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  assigned_by_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  assigned_by_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_order_cutting_assignments_order_master UNIQUE(order_id, cutting_master_id)
);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_cutting_assignments_updated_at ON public.order_cutting_assignments;
CREATE TRIGGER trg_order_cutting_assignments_updated_at
BEFORE UPDATE ON public.order_cutting_assignments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_order_cutting_assignments_order_id ON public.order_cutting_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_cutting_assignments_cutting_master_id ON public.order_cutting_assignments(cutting_master_id);
CREATE INDEX IF NOT EXISTS idx_order_cutting_assignments_assigned_by_id ON public.order_cutting_assignments(assigned_by_id);

-- Enable RLS and allow authenticated users to manage
ALTER TABLE public.order_cutting_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth select order_cutting_assignments" ON public.order_cutting_assignments;
DROP POLICY IF EXISTS "auth manage order_cutting_assignments" ON public.order_cutting_assignments;

CREATE POLICY "auth select order_cutting_assignments" ON public.order_cutting_assignments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth manage order_cutting_assignments" ON public.order_cutting_assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add comment
COMMENT ON TABLE public.order_cutting_assignments IS 'Multiple cutting master assignments per order';
