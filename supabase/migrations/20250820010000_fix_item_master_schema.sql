-- Fix item_master table schema
-- Add missing columns that are being queried in the application

-- Add item_type column to item_master table
ALTER TABLE public.item_master 
ADD COLUMN IF NOT EXISTS item_type TEXT;

-- Add image_url column to item_master table
ALTER TABLE public.item_master 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add gst_rate column to item_master table
ALTER TABLE public.item_master 
ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 18.00;

-- Add is_active column to item_master table (for backward compatibility)
ALTER TABLE public.item_master 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add image_url column to product_master table if not exists
ALTER TABLE public.product_master 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Handle bom_records table - add status column if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bom_records') THEN
    -- Add status column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bom_records' AND column_name = 'status') THEN
      ALTER TABLE public.bom_records ADD COLUMN status TEXT DEFAULT 'draft';
    END IF;
    
    -- Make order_id optional if it's currently NOT NULL
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'bom_records' 
      AND column_name = 'order_id' 
      AND is_nullable = 'NO'
    ) THEN
      ALTER TABLE public.bom_records ALTER COLUMN order_id DROP NOT NULL;
    END IF;
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
  created_at timestamptz default now()
);

-- Enable RLS on bom_record_items if not already enabled
ALTER TABLE public.bom_record_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for bom_record_items if not exists
DROP POLICY IF EXISTS "auth manage bom_record_items" ON public.bom_record_items;
CREATE POLICY "auth manage bom_record_items" ON public.bom_record_items 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Create indexes for better performance (only after columns are added)
CREATE INDEX IF NOT EXISTS idx_item_master_item_type ON public.item_master(item_type);
CREATE INDEX IF NOT EXISTS idx_item_master_is_active ON public.item_master(is_active);
CREATE INDEX IF NOT EXISTS idx_bom_record_items_bom_id ON public.bom_record_items(bom_id);
CREATE INDEX IF NOT EXISTS idx_bom_record_items_item_id ON public.bom_record_items(item_id);

-- Create product_master status index only if the column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' 
    AND column_name = 'status'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_product_master_status ON public.product_master(status);
  END IF;
END $$;

-- Create bom_records status index only if the column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bom_records' 
    AND column_name = 'status'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_bom_records_status ON public.bom_records(status);
  END IF;
END $$;

-- Update existing records to have default values (only if columns exist)
DO $$
BEGIN
  -- Update item_type only if both item_type and category columns exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'item_master' 
    AND column_name = 'item_type'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'item_master' 
    AND column_name = 'category'
  ) THEN
    UPDATE public.item_master 
    SET item_type = category 
    WHERE item_type IS NULL;
  END IF;
  
  -- Update is_active only if the column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'item_master' 
    AND column_name = 'is_active'
  ) THEN
    UPDATE public.item_master 
    SET is_active = true 
    WHERE is_active IS NULL;
  END IF;
END $$;

-- Add RLS policies if not already enabled
ALTER TABLE public.item_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_master ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and create new ones
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.item_master;
CREATE POLICY "Allow all operations for authenticated users" ON public.item_master
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.product_master;
CREATE POLICY "Allow all operations for authenticated users" ON public.product_master
  FOR ALL USING (auth.role() = 'authenticated');
