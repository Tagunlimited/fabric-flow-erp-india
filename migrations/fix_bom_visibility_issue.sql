-- Fix BOM visibility issue in purchase orders
-- This script ensures BOMs are properly linked and visible

-- Step 1: Check and fix table naming inconsistency
DO $$
BEGIN
  -- If bom_items exists but bom_record_items doesn't, rename the table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bom_items' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bom_record_items' AND table_schema = 'public') THEN
    ALTER TABLE public.bom_items RENAME TO bom_record_items;
    RAISE NOTICE 'Renamed bom_items to bom_record_items';
  END IF;
END $$;

-- Step 2: Ensure bom_record_items table exists with correct structure
CREATE TABLE IF NOT EXISTS public.bom_record_items (
  id uuid primary key default gen_random_uuid(),
  bom_id uuid not null references public.bom_records(id) on delete cascade,
  item_id uuid references public.item_master(id) on delete set null,
  item_code text,
  item_name text,
  category text,
  unit_of_measure text,
  qty_per_product numeric,
  qty_total numeric,
  stock numeric default 0,
  to_order numeric default 0,
  fabric_name text,
  fabric_color text,
  fabric_gsm text,
  created_at timestamptz default now()
);

-- Step 3: Add missing columns to bom_records if they don't exist
ALTER TABLE public.bom_records 
ADD COLUMN IF NOT EXISTS bom_number text,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Step 4: Ensure RLS policies are correct
ALTER TABLE public.bom_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_record_items ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies to ensure they work
DROP POLICY IF EXISTS "auth manage bom_records" ON public.bom_records;
CREATE POLICY "auth manage bom_records" ON public.bom_records 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth manage bom_record_items" ON public.bom_record_items;
CREATE POLICY "auth manage bom_record_items" ON public.bom_record_items 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Step 5: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bom_records_order_id ON public.bom_records(order_id);
CREATE INDEX IF NOT EXISTS idx_bom_records_created_by ON public.bom_records(created_by);
CREATE INDEX IF NOT EXISTS idx_bom_records_bom_number ON public.bom_records(bom_number);
CREATE INDEX IF NOT EXISTS idx_bom_record_items_bom_id ON public.bom_record_items(bom_id);
CREATE INDEX IF NOT EXISTS idx_bom_record_items_item_id ON public.bom_record_items(item_id);

-- Step 6: Add bom_id column to purchase_orders if it doesn't exist
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS bom_id uuid REFERENCES public.bom_records(id);

-- Create index for bom_id in purchase_orders
CREATE INDEX IF NOT EXISTS idx_purchase_orders_bom_id ON public.purchase_orders(bom_id);

-- Step 7: Check current BOM data
SELECT 'Current BOM Records:' as info;
SELECT id, bom_number, product_name, order_id, created_at 
FROM public.bom_records 
ORDER BY created_at DESC 
LIMIT 5;

SELECT 'Current BOM Items:' as info;
SELECT bri.id, bri.bom_id, bri.item_name, bri.category, bri.qty_total, bri.to_order
FROM public.bom_record_items bri
JOIN public.bom_records br ON bri.bom_id = br.id
ORDER BY br.created_at DESC, bri.created_at DESC
LIMIT 10;

-- Step 8: Check if any purchase orders are linked to BOMs
SELECT 'Purchase Orders with BOM links:' as info;
SELECT po.id, po.po_number, po.bom_id, br.bom_number, br.product_name
FROM public.purchase_orders po
LEFT JOIN public.bom_records br ON po.bom_id = br.id
WHERE po.bom_id IS NOT NULL
ORDER BY po.created_at DESC
LIMIT 5;
