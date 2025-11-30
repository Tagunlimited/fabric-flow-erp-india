-- Add cut_quantities_by_size column to order_cutting_assignments table
-- This allows tracking size-wise cut quantities per cutting master

-- Add the new column to store size-wise cut quantities as JSONB
ALTER TABLE public.order_cutting_assignments 
ADD COLUMN IF NOT EXISTS cut_quantities_by_size JSONB DEFAULT '{}';

-- Add a comment to explain the column
COMMENT ON COLUMN public.order_cutting_assignments.cut_quantities_by_size IS 'Stores cutting quantities by size per cutting master as JSONB object, e.g., {"XS": 10, "S": 20, "M": 30}';

-- Create an index on the JSONB column for better query performance
CREATE INDEX IF NOT EXISTS idx_order_cutting_assignments_cut_quantities_by_size 
ON public.order_cutting_assignments USING GIN (cut_quantities_by_size);

