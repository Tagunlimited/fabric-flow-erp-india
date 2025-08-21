-- Fix BOM records table schema
-- Make order_id optional since BOMs can be created independently
ALTER TABLE public.bom_records 
ALTER COLUMN order_id DROP NOT NULL;

-- Add status column for BOM state management
ALTER TABLE public.bom_records 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';

-- Add index for status column
CREATE INDEX IF NOT EXISTS idx_bom_records_status ON public.bom_records(status);
