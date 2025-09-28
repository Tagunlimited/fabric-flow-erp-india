-- Update order_assignments table to include tailor batch assignments
-- This allows cutting masters and pattern masters to assign tailor batches to orders

-- Add batch assignment columns to order_assignments table
ALTER TABLE public.order_assignments 
ADD COLUMN IF NOT EXISTS assigned_batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS assigned_batch_name TEXT,
ADD COLUMN IF NOT EXISTS assigned_batch_code TEXT,
ADD COLUMN IF NOT EXISTS batch_assignment_date DATE,
ADD COLUMN IF NOT EXISTS assigned_by_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS assigned_by_name TEXT,
ADD COLUMN IF NOT EXISTS batch_assignment_notes TEXT;

-- Create index for batch assignments
CREATE INDEX IF NOT EXISTS idx_order_assignments_assigned_batch_id ON public.order_assignments(assigned_batch_id);
CREATE INDEX IF NOT EXISTS idx_order_assignments_assigned_by_id ON public.order_assignments(assigned_by_id);

-- Add comments for clarity
COMMENT ON COLUMN public.order_assignments.assigned_batch_id IS 'ID of the tailor batch assigned to this order';
COMMENT ON COLUMN public.order_assignments.assigned_batch_name IS 'Name of the assigned batch for display purposes';
COMMENT ON COLUMN public.order_assignments.assigned_batch_code IS 'Code of the assigned batch for display purposes';
COMMENT ON COLUMN public.order_assignments.batch_assignment_date IS 'Date when the batch was assigned to this order';
COMMENT ON COLUMN public.order_assignments.assigned_by_id IS 'ID of the employee who assigned the batch';
COMMENT ON COLUMN public.order_assignments.assigned_by_name IS 'Name of the employee who assigned the batch';
COMMENT ON COLUMN public.order_assignments.batch_assignment_notes IS 'Notes about the batch assignment';

-- Create a view to get order assignments with batch details
CREATE OR REPLACE VIEW public.order_assignments_with_batches AS
SELECT 
    oa.*,
    b.batch_name,
    b.batch_code,
    b.max_capacity,
    b.current_capacity,
    b.status as batch_status,
    b.tailor_type as batch_tailor_type,
    -- Batch leader info
    bl.id as batch_leader_id,
    bl.full_name as batch_leader_name,
    bl.tailor_code as batch_leader_code,
    -- Assigned by info
    ab.full_name as assigned_by_full_name,
    ab.designation as assigned_by_designation
FROM public.order_assignments oa
LEFT JOIN public.batches b ON oa.assigned_batch_id = b.id
LEFT JOIN public.tailors bl ON b.batch_leader_id = bl.id
LEFT JOIN public.employees ab ON oa.assigned_by_id = ab.id;

-- Grant permissions on the view
GRANT SELECT ON public.order_assignments_with_batches TO authenticated;

-- Create a function to get available batches for assignment
CREATE OR REPLACE FUNCTION public.get_available_batches_for_assignment()
RETURNS TABLE (
    id UUID,
    batch_name TEXT,
    batch_code TEXT,
    tailor_type TEXT,
    max_capacity INTEGER,
    current_capacity INTEGER,
    status TEXT,
    batch_leader_name TEXT,
    available_capacity INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.batch_name,
        b.batch_code,
        b.tailor_type,
        b.max_capacity,
        b.current_capacity,
        b.status,
        bl.full_name as batch_leader_name,
        (b.max_capacity - b.current_capacity) as available_capacity
    FROM public.batches b
    LEFT JOIN public.tailors bl ON b.batch_leader_id = bl.id
    WHERE b.status = 'active'
    AND b.current_capacity < b.max_capacity
    ORDER BY b.batch_name;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.get_available_batches_for_assignment() TO authenticated;
