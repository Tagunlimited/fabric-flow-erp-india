-- Setup Tailor Management System
-- This script creates the necessary tables and updates for tailor management

-- 1. Create tailor_types enum
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tailor_type') THEN
        CREATE TYPE tailor_type AS ENUM ('single_needle', 'overlock_flatlock');
    END IF;
END $$;

-- 2. Create batches table
CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_name TEXT NOT NULL,
    batch_code TEXT NOT NULL UNIQUE,
    tailor_type tailor_type NOT NULL,
    batch_leader_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    max_capacity INTEGER DEFAULT 10,
    current_capacity INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'full')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- 3. Add tailor_type column to employees table
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS tailor_type tailor_type,
ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_batch_leader BOOLEAN DEFAULT false;

-- 4. Create tailor_assignments table for order assignments
CREATE TABLE IF NOT EXISTS tailor_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    assigned_tailor_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    assigned_date TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'on_hold')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    estimated_completion_date TIMESTAMPTZ,
    actual_completion_date TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_employees_tailor_type ON employees(tailor_type);
CREATE INDEX IF NOT EXISTS idx_employees_batch_id ON employees(batch_id);
CREATE INDEX IF NOT EXISTS idx_employees_is_batch_leader ON employees(is_batch_leader);
CREATE INDEX IF NOT EXISTS idx_batches_tailor_type ON batches(tailor_type);
CREATE INDEX IF NOT EXISTS idx_batches_batch_leader ON batches(batch_leader_id);
CREATE INDEX IF NOT EXISTS idx_tailor_assignments_order_id ON tailor_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_tailor_assignments_batch_id ON tailor_assignments(batch_id);
CREATE INDEX IF NOT EXISTS idx_tailor_assignments_tailor_id ON tailor_assignments(assigned_tailor_id);

-- 6. Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_batches_updated_at ON batches;
DROP TRIGGER IF EXISTS update_tailor_assignments_updated_at ON tailor_assignments;

-- Create triggers
CREATE TRIGGER update_batches_updated_at
    BEFORE UPDATE ON batches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tailor_assignments_updated_at
    BEFORE UPDATE ON tailor_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 7. Create RLS policies
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tailor_assignments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON batches;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON batches;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON batches;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON batches;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON tailor_assignments;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON tailor_assignments;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON tailor_assignments;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON tailor_assignments;

-- Create policies for batches
CREATE POLICY "Enable read access for authenticated users" ON batches
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON batches
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users" ON batches
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable delete access for authenticated users" ON batches
    FOR DELETE TO authenticated USING (true);

-- Create policies for tailor_assignments
CREATE POLICY "Enable read access for authenticated users" ON tailor_assignments
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON tailor_assignments
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users" ON tailor_assignments
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable delete access for authenticated users" ON tailor_assignments
    FOR DELETE TO authenticated USING (true);

-- 8. Insert sample data
INSERT INTO batches (batch_name, batch_code, tailor_type, max_capacity, status) VALUES
('Single Needle Batch 1', 'SN-B001', 'single_needle', 8, 'active'),
('Single Needle Batch 2', 'SN-B002', 'single_needle', 8, 'active'),
('Overlock Batch 1', 'OF-B001', 'overlock_flatlock', 6, 'active'),
('Overlock Batch 2', 'OF-B002', 'overlock_flatlock', 6, 'active')
ON CONFLICT (batch_code) DO NOTHING;

-- 9. Create a view for tailor management
CREATE OR REPLACE VIEW tailor_management_view AS
SELECT 
    e.id,
    e.full_name,
    e.employee_code,
    e.tailor_type,
    e.batch_id,
    e.is_batch_leader,
    b.batch_name,
    b.batch_code,
    b.status as batch_status,
    b.max_capacity,
    b.current_capacity,
    COUNT(ta.id) as assigned_orders,
    COUNT(CASE WHEN ta.status = 'in_progress' THEN 1 END) as active_orders,
    COUNT(CASE WHEN ta.status = 'completed' THEN 1 END) as completed_orders
FROM employees e
LEFT JOIN batches b ON e.batch_id = b.id
LEFT JOIN tailor_assignments ta ON e.id = ta.assigned_tailor_id
WHERE e.tailor_type IS NOT NULL
GROUP BY e.id, e.full_name, e.employee_code, e.tailor_type, e.batch_id, e.is_batch_leader,
         b.batch_name, b.batch_code, b.status, b.max_capacity, b.current_capacity;

-- 10. Create RLS policy for the view
ALTER VIEW tailor_management_view SET (security_invoker = true);

-- Success message
SELECT 'Tailor management system setup completed successfully!' as status;
