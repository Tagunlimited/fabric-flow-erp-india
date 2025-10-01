-- Comprehensive fix for BOM database schema issues
-- This script ensures proper table structure and data consistency

-- Step 1: Check if bom_items table exists and bom_record_items does not
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bom_items' AND table_schema = 'public') AND
     NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bom_record_items' AND table_schema = 'public') THEN
    RAISE NOTICE 'Renaming bom_items to bom_record_items...';
    ALTER TABLE public.bom_items RENAME TO bom_record_items;
    -- Recreate RLS policies and indexes if they were on bom_items
    DROP POLICY IF EXISTS "auth manage bom_items" ON public.bom_record_items;
    CREATE POLICY "auth manage bom_record_items" ON public.bom_record_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP INDEX IF EXISTS idx_bom_items_bom_id;
    CREATE INDEX IF NOT EXISTS idx_bom_record_items_bom_id ON public.bom_record_items(bom_id);
    DROP INDEX IF EXISTS idx_bom_items_item_id;
    CREATE INDEX IF NOT EXISTS idx_bom_record_items_item_id ON public.bom_record_items(item_id);
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
  created_at timestamptz default now(),
  fabric_name text,
  fabric_color text,
  fabric_gsm text
);

-- Step 3: Add missing columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bom_record_items' AND column_name = 'fabric_name') THEN
    ALTER TABLE public.bom_record_items ADD COLUMN fabric_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bom_record_items' AND column_name = 'fabric_color') THEN
    ALTER TABLE public.bom_record_items ADD COLUMN fabric_color text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bom_record_items' AND column_name = 'fabric_gsm') THEN
    ALTER TABLE public.bom_record_items ADD COLUMN fabric_gsm text;
  END IF;
END $$;

-- Step 4: Enable RLS on bom_record_items if not already enabled
ALTER TABLE public.bom_record_items ENABLE ROW LEVEL SECURITY;

-- Step 5: Create RLS policy for bom_record_items if not exists
DROP POLICY IF EXISTS "auth manage bom_record_items" ON public.bom_record_items;
CREATE POLICY "auth manage bom_record_items" ON public.bom_record_items 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Step 6: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bom_record_items_bom_id ON public.bom_record_items(bom_id);
CREATE INDEX IF NOT EXISTS idx_bom_record_items_item_id ON public.bom_record_items(item_id);

-- Step 7: Ensure bom_records table has the correct structure
ALTER TABLE public.bom_records 
ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE public.bom_records 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';

CREATE INDEX IF NOT EXISTS idx_bom_records_status ON public.bom_records(status);

-- Step 8: Add comments for documentation
COMMENT ON TABLE public.bom_record_items IS 'Stores Bill of Materials items for each BOM record';

-- Step 9: Check current data and provide summary
SELECT 'BOM Records Count:' as info, COUNT(*) as count FROM public.bom_records;
SELECT 'BOM Items Count:' as info, COUNT(*) as count FROM public.bom_record_items;

-- Step 10: Show sample data
SELECT 'Sample BOM Records:' as info;
SELECT id, product_name, total_order_qty, status, created_at FROM public.bom_records ORDER BY created_at DESC LIMIT 3;

SELECT 'Sample BOM Items:' as info;
SELECT bom_id, item_name, category, qty_total, stock, to_order, fabric_name, fabric_color, fabric_gsm FROM public.bom_record_items ORDER BY created_at DESC LIMIT 5;
