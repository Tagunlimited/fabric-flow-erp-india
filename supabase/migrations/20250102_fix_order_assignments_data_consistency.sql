-- Fix order_assignments data consistency
-- This migration ensures that order_assignments table has complete data
-- by syncing cutting master information from order_cutting_assignments

-- Step 1: Update order_assignments records that have stitching rates but missing cutting master info
-- by getting the cutting master info from order_cutting_assignments
UPDATE public.order_assignments 
SET 
  cutting_master_id = oca.cutting_master_id,
  cutting_master_name = oca.cutting_master_name
FROM public.order_cutting_assignments oca
WHERE public.order_assignments.order_id = oca.order_id
  AND public.order_assignments.cutting_master_id IS NULL
  AND oca.cutting_master_id IS NOT NULL;

-- Step 2: Insert missing order_assignments records for orders that only exist in order_cutting_assignments
-- but have stitching rates (this handles edge cases)
INSERT INTO public.order_assignments (order_id, cutting_master_id, cutting_master_name, cutting_work_date)
SELECT 
  oca.order_id,
  oca.cutting_master_id,
  oca.cutting_master_name,
  oca.assigned_date
FROM public.order_cutting_assignments oca
WHERE oca.order_id NOT IN (
  SELECT DISTINCT order_id FROM public.order_assignments WHERE order_id IS NOT NULL
)
AND oca.cutting_master_id IS NOT NULL;

-- Step 3: Ensure cutting_work_date is set for records that have cutting masters but no work date
UPDATE public.order_assignments 
SET cutting_work_date = COALESCE(cutting_work_date, CURRENT_DATE)
WHERE cutting_master_id IS NOT NULL 
  AND cutting_work_date IS NULL;

-- Add comments for documentation
COMMENT ON TABLE public.order_assignments IS 'Primary assignments table - should contain complete cutting master and stitching rate information';
COMMENT ON TABLE public.order_cutting_assignments IS 'Multiple cutting master assignments - supplements order_assignments for multi-master scenarios';
