-- Fix GRN items table to allow null item_id
-- This resolves the "null value in column item_id violates not-null constraint" error

-- Make item_id column nullable in grn_items table
ALTER TABLE public.grn_items 
ALTER COLUMN item_id DROP NOT NULL;

-- Add a comment explaining why item_id can be null
COMMENT ON COLUMN public.grn_items.item_id IS 'Item ID from item_master table. Can be null for items that are not in the master item list (e.g., custom items, fabrics)';

-- Create an index on item_id for better performance (only on non-null values)
CREATE INDEX IF NOT EXISTS idx_grn_items_item_id ON public.grn_items(item_id) WHERE item_id IS NOT NULL;
