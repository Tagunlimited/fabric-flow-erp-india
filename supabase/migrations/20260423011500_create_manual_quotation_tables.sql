-- Manual quotation storage (additive; does not modify existing order flow)

CREATE TABLE IF NOT EXISTS public.manual_quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number TEXT UNIQUE NOT NULL,
  quotation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  customer_id UUID REFERENCES public.customers(id),
  sales_manager UUID REFERENCES public.employees(id),
  order_date DATE,
  expected_delivery_date DATE,
  gst_rate NUMERIC(10,2) DEFAULT 0,
  subtotal NUMERIC(12,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(12,2) DEFAULT 0,
  advance_amount NUMERIC(12,2) DEFAULT 0,
  balance_amount NUMERIC(12,2) DEFAULT 0,
  payment_channel TEXT,
  reference_id TEXT,
  notes TEXT,
  converted_order_id UUID REFERENCES public.orders(id),
  converted_at TIMESTAMPTZ,
  converted_by UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS public.manual_quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_quotation_id UUID NOT NULL REFERENCES public.manual_quotations(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit_price NUMERIC(12,2) DEFAULT 0,
  total_price NUMERIC(12,2) DEFAULT 0,
  product_category_id UUID REFERENCES public.product_categories(id),
  category_image_url TEXT,
  product_description TEXT,
  fabric_id UUID REFERENCES public.fabric_master(id),
  gsm TEXT,
  color TEXT,
  remarks TEXT,
  size_type_id UUID REFERENCES public.size_types(id),
  sizes_quantities JSONB DEFAULT '{}'::jsonb,
  size_prices JSONB DEFAULT '{}'::jsonb,
  gst_rate NUMERIC(10,2) DEFAULT 0,
  specifications JSONB DEFAULT '{}'::jsonb,
  item_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.manual_quotation_additional_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_quotation_id UUID NOT NULL REFERENCES public.manual_quotations(id) ON DELETE CASCADE,
  particular TEXT NOT NULL,
  rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_percentage NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_incl_gst NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'automatic';

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS manual_quotation_id UUID REFERENCES public.manual_quotations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_manual_quotations_status ON public.manual_quotations(status);
CREATE INDEX IF NOT EXISTS idx_manual_quotations_customer ON public.manual_quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_manual_quotations_created_at ON public.manual_quotations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_manual_quotation_items_parent ON public.manual_quotation_items(manual_quotation_id);
CREATE INDEX IF NOT EXISTS idx_manual_quotation_charges_parent ON public.manual_quotation_additional_charges(manual_quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotations_source ON public.quotations(source);
CREATE INDEX IF NOT EXISTS idx_quotations_manual_quotation_id ON public.quotations(manual_quotation_id);

ALTER TABLE public.manual_quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_quotation_additional_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.manual_quotations;
CREATE POLICY "Allow all operations for authenticated users"
ON public.manual_quotations
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.manual_quotation_items;
CREATE POLICY "Allow all operations for authenticated users"
ON public.manual_quotation_items
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.manual_quotation_additional_charges;
CREATE POLICY "Allow all operations for authenticated users"
ON public.manual_quotation_additional_charges
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

DROP TRIGGER IF EXISTS update_manual_quotations_updated_at ON public.manual_quotations;
CREATE TRIGGER update_manual_quotations_updated_at
BEFORE UPDATE ON public.manual_quotations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_manual_quotation_items_updated_at ON public.manual_quotation_items;
CREATE TRIGGER update_manual_quotation_items_updated_at
BEFORE UPDATE ON public.manual_quotation_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_manual_quotation_additional_charges_updated_at ON public.manual_quotation_additional_charges;
CREATE TRIGGER update_manual_quotation_additional_charges_updated_at
BEFORE UPDATE ON public.manual_quotation_additional_charges
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
