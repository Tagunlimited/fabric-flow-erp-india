-- Create order_batch_assignments table for multiple batch assignments per order
-- This allows cutting masters to assign multiple tailor batches to a single order
-- and distribute quantities by size across those batches

-- Drop existing table if it exists
DROP TABLE IF EXISTS public.order_batch_assignments CASCADE;

-- Create the main order_batch_assignments table
CREATE TABLE public.order_batch_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
    assigned_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    assigned_by_name TEXT,
    assignment_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique combination of order and batch
    CONSTRAINT uq_order_batch_assignment UNIQUE(order_id, batch_id)
);

-- Create order_batch_size_distributions table for size-wise quantity distribution
DROP TABLE IF EXISTS public.order_batch_size_distributions CASCADE;

CREATE TABLE public.order_batch_size_distributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_batch_assignment_id UUID NOT NULL REFERENCES public.order_batch_assignments(id) ON DELETE CASCADE,
    size_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique combination of assignment and size
    CONSTRAINT uq_assignment_size UNIQUE(order_batch_assignment_id, size_name)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_order_batch_assignments_order_id ON public.order_batch_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_batch_assignments_batch_id ON public.order_batch_assignments(batch_id);
CREATE INDEX IF NOT EXISTS idx_order_batch_assignments_assigned_by ON public.order_batch_assignments(assigned_by_id);
CREATE INDEX IF NOT EXISTS idx_order_batch_size_distributions_assignment_id ON public.order_batch_size_distributions(order_batch_assignment_id);
CREATE INDEX IF NOT EXISTS idx_order_batch_size_distributions_size ON public.order_batch_size_distributions(size_name);

-- Add updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_order_batch_assignments_updated_at 
    BEFORE UPDATE ON public.order_batch_assignments 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_order_batch_size_distributions_updated_at 
    BEFORE UPDATE ON public.order_batch_size_distributions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.order_batch_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_batch_size_distributions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.order_batch_assignments;
CREATE POLICY "Enable read access for authenticated users" ON public.order_batch_assignments FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.order_batch_assignments;
CREATE POLICY "Enable insert for authenticated users" ON public.order_batch_assignments FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.order_batch_assignments;
CREATE POLICY "Enable update for authenticated users" ON public.order_batch_assignments FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.order_batch_assignments;
CREATE POLICY "Enable delete for authenticated users" ON public.order_batch_assignments FOR DELETE USING (auth.role() = 'authenticated');

-- RLS policies for size distributions
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.order_batch_size_distributions;
CREATE POLICY "Enable read access for authenticated users" ON public.order_batch_size_distributions FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.order_batch_size_distributions;
CREATE POLICY "Enable insert for authenticated users" ON public.order_batch_size_distributions FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.order_batch_size_distributions;
CREATE POLICY "Enable update for authenticated users" ON public.order_batch_size_distributions FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.order_batch_size_distributions;
CREATE POLICY "Enable delete for authenticated users" ON public.order_batch_size_distributions FOR DELETE USING (auth.role() = 'authenticated');

-- Create a view to get order batch assignments with batch and size details
CREATE OR REPLACE VIEW public.order_batch_assignments_with_details AS
SELECT 
    oba.id as assignment_id,
    oba.order_id,
    oba.batch_id,
    oba.assigned_by_id,
    oba.assigned_by_name,
    oba.assignment_date,
    oba.notes as assignment_notes,
    oba.created_at,
    oba.updated_at,
    
    -- Batch details
    b.batch_name,
    b.batch_code,
    b.tailor_type,
    b.max_capacity,
    b.current_capacity,
    b.status as batch_status,
    
    -- Batch leader details
    bl.id as batch_leader_id,
    bl.full_name as batch_leader_name,
    bl.tailor_code as batch_leader_code,
    bl.avatar_url as batch_leader_avatar,
    
    -- Size distributions
    COALESCE(
        json_agg(
            json_build_object(
                'size_name', obsd.size_name,
                'quantity', obsd.quantity
            ) ORDER BY obsd.size_name
        ) FILTER (WHERE obsd.size_name IS NOT NULL),
        '[]'::json
    ) as size_distributions,
    
    -- Total quantity for this batch assignment
    COALESCE(SUM(obsd.quantity), 0) as total_quantity

FROM public.order_batch_assignments oba
LEFT JOIN public.batches b ON oba.batch_id = b.id
LEFT JOIN public.tailors bl ON bl.batch_id = b.id AND bl.is_batch_leader = true
LEFT JOIN public.order_batch_size_distributions obsd ON oba.id = obsd.order_batch_assignment_id
GROUP BY 
    oba.id, oba.order_id, oba.batch_id, oba.assigned_by_id, oba.assigned_by_name, 
    oba.assignment_date, oba.notes, oba.created_at, oba.updated_at,
    b.batch_name, b.batch_code, b.tailor_type, b.max_capacity, b.current_capacity, b.status,
    bl.id, bl.full_name, bl.tailor_code, bl.avatar_url;

-- Grant permissions on the view
GRANT SELECT ON public.order_batch_assignments_with_details TO authenticated;

-- Create a function to get available sizes for an order
CREATE OR REPLACE FUNCTION public.get_order_sizes(order_uuid UUID)
RETURNS TABLE (
    size_name TEXT,
    total_quantity INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        oi.size_name,
        SUM(oi.quantity) as total_quantity
    FROM public.order_items oi
    WHERE oi.order_id = order_uuid
    AND oi.size_name IS NOT NULL
    GROUP BY oi.size_name
    ORDER BY oi.size_name;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.get_order_sizes(UUID) TO authenticated;

-- Add comments for clarity
COMMENT ON TABLE public.order_batch_assignments IS 'Multiple batch assignments per order with size-wise quantity distribution';
COMMENT ON TABLE public.order_batch_size_distributions IS 'Size-wise quantity distribution for each batch assignment';
COMMENT ON VIEW public.order_batch_assignments_with_details IS 'Complete view of order batch assignments with batch and size details';
COMMENT ON FUNCTION public.get_order_sizes(UUID) IS 'Get all sizes and quantities for a specific order';
