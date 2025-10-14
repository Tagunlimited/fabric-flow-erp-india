-- Fix BOM table naming issue
-- This script ensures we have the correct table structure

-- First, check if bom_items table exists and rename it to bom_record_items if needed
DO $$
BEGIN
  -- If bom_items exists but bom_record_items doesn't, rename the table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bom_items' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bom_record_items' AND table_schema = 'public') THEN
    ALTER TABLE public.bom_items RENAME TO bom_record_items;
    RAISE NOTICE 'Renamed bom_items to bom_record_items';
  END IF;
END $$;

-- Ensure bom_record_items table exists with correct structure
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

-- Enable RLS on bom_record_items if not already enabled
ALTER TABLE public.bom_record_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for bom_record_items if not exists
DROP POLICY IF EXISTS "auth manage bom_record_items" ON public.bom_record_items;
CREATE POLICY "auth manage bom_record_items" ON public.bom_record_items 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bom_record_items_bom_id ON public.bom_record_items(bom_id);
CREATE INDEX IF NOT EXISTS idx_bom_record_items_item_id ON public.bom_record_items(item_id);

-- Add comments for documentation
COMMENT ON TABLE public.bom_record_items IS 'Stores Bill of Materials items for each BOM record';

-- Check current data
SELECT 'Current BOM Records:' as info;
SELECT id, product_name, total_order_qty, created_at FROM public.bom_records LIMIT 5;

SELECT 'Current BOM Items:' as info;
SELECT bom_id, item_name, category, qty_total, stock, to_order FROM public.bom_record_items LIMIT 10;
