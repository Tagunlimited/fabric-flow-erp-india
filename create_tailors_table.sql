-- Create a dedicated tailors table with avatar support
-- This is separate from the employees table for better tailor-specific management

-- Create ENUM for tailor types
DO $$ BEGIN
    CREATE TYPE tailor_type AS ENUM ('single_needle', 'overlock_flatlock');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create ENUM for tailor status
DO $$ BEGIN
    CREATE TYPE tailor_status AS ENUM ('active', 'inactive', 'on_leave', 'terminated');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create ENUM for skill level
DO $$ BEGIN
    CREATE TYPE skill_level AS ENUM ('beginner', 'intermediate', 'advanced', 'expert');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create tailors table
DROP TABLE IF EXISTS public.tailors CASCADE;
CREATE TABLE public.tailors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tailor_code VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    tailor_type tailor_type NOT NULL,
    skill_level skill_level DEFAULT 'beginner',
    batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
    is_batch_leader BOOLEAN DEFAULT FALSE,
    status tailor_status DEFAULT 'active',
    
    -- Personal Information
    date_of_birth DATE,
    gender VARCHAR(10) CHECK (gender IN ('Male', 'Female', 'Other')),
    personal_phone VARCHAR(15),
    personal_email VARCHAR(255),
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(15),
    
    -- Address Information
    address_line1 TEXT,
    address_line2 TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),
    country VARCHAR(100) DEFAULT 'India',
    
    -- Employment Information
    joining_date DATE DEFAULT CURRENT_DATE,
    employment_type VARCHAR(20) DEFAULT 'Full-time' CHECK (employment_type IN ('Full-time', 'Part-time', 'Contract', 'Intern')),
    salary DECIMAL(10,2),
    work_hours_per_day INTEGER DEFAULT 8,
    
    -- Performance Metrics
    total_orders_completed INTEGER DEFAULT 0,
    average_completion_time DECIMAL(5,2), -- in hours
    quality_rating DECIMAL(3,2) DEFAULT 0.0, -- 0.0 to 5.0
    efficiency_score DECIMAL(3,2) DEFAULT 0.0, -- 0.0 to 5.0
    
    -- System Fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);

-- Create batches table
DROP TABLE IF EXISTS public.batches CASCADE;
CREATE TABLE public.batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_name VARCHAR(100) NOT NULL UNIQUE,
    batch_code VARCHAR(20) UNIQUE NOT NULL,
    tailor_type tailor_type NOT NULL,
    max_capacity INTEGER DEFAULT 10,
    current_capacity INTEGER DEFAULT 0,
    batch_leader_id UUID REFERENCES public.tailors(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'full')),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create tailor_assignments table
DROP TABLE IF EXISTS public.tailor_assignments CASCADE;
CREATE TABLE public.tailor_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tailor_id UUID REFERENCES public.tailors(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'on_hold', 'cancelled')),
    priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    quality_rating DECIMAL(3,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create tailor_skills table for tracking specific skills
DROP TABLE IF EXISTS public.tailor_skills CASCADE;
CREATE TABLE public.tailor_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tailor_id UUID REFERENCES public.tailors(id) ON DELETE CASCADE,
    skill_name VARCHAR(100) NOT NULL,
    proficiency_level skill_level NOT NULL,
    years_of_experience DECIMAL(3,1) DEFAULT 0.0,
    certified BOOLEAN DEFAULT FALSE,
    certification_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tailor_id, skill_name)
);

-- Create tailor_attendance table
DROP TABLE IF EXISTS public.tailor_attendance CASCADE;
CREATE TABLE public.tailor_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tailor_id UUID REFERENCES public.tailors(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    hours_worked DECIMAL(4,2) DEFAULT 0.0,
    status VARCHAR(20) DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'half_day', 'leave')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tailor_id, attendance_date)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tailors_tailor_type ON public.tailors(tailor_type);
CREATE INDEX IF NOT EXISTS idx_tailors_batch_id ON public.tailors(batch_id);
CREATE INDEX IF NOT EXISTS idx_tailors_status ON public.tailors(status);
CREATE INDEX IF NOT EXISTS idx_tailors_skill_level ON public.tailors(skill_level);
CREATE INDEX IF NOT EXISTS idx_tailor_assignments_tailor_id ON public.tailor_assignments(tailor_id);
CREATE INDEX IF NOT EXISTS idx_tailor_assignments_order_id ON public.tailor_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_tailor_assignments_status ON public.tailor_assignments(status);
CREATE INDEX IF NOT EXISTS idx_tailor_attendance_tailor_id ON public.tailor_attendance(tailor_id);
CREATE INDEX IF NOT EXISTS idx_tailor_attendance_date ON public.tailor_attendance(attendance_date);

-- Create a view for tailor management with batch information
DROP VIEW IF EXISTS public.tailor_management_view CASCADE;
CREATE VIEW public.tailor_management_view AS
SELECT
    t.id,
    t.tailor_code,
    t.full_name,
    t.avatar_url,
    t.tailor_type,
    t.skill_level,
    t.batch_id,
    t.is_batch_leader,
    t.status,
    t.personal_phone,
    t.personal_email,
    t.joining_date,
    t.employment_type,
    t.total_orders_completed,
    t.average_completion_time,
    t.quality_rating,
    t.efficiency_score,
    b.batch_name,
    b.batch_code,
    b.max_capacity,
    b.current_capacity,
    bl.full_name AS batch_leader_name,
    (SELECT COUNT(*) FROM public.tailor_assignments ta WHERE ta.tailor_id = t.id AND ta.status IN ('assigned', 'in_progress')) AS active_assignments,
    (SELECT COUNT(*) FROM public.tailor_assignments ta WHERE ta.tailor_id = t.id AND ta.status = 'completed') AS completed_assignments,
    t.created_at,
    t.updated_at
FROM
    public.tailors t
LEFT JOIN
    public.batches b ON t.batch_id = b.id
LEFT JOIN
    public.tailors bl ON b.batch_leader_id = bl.id;

-- Enable RLS (Row Level Security)
ALTER TABLE public.tailors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tailor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tailor_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tailor_attendance ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tailors table
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.tailors;
CREATE POLICY "Enable read access for all authenticated users" ON public.tailors FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.tailors;
CREATE POLICY "Enable insert for authenticated users" ON public.tailors FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.tailors;
CREATE POLICY "Enable update for authenticated users" ON public.tailors FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.tailors;
CREATE POLICY "Enable delete for authenticated users" ON public.tailors FOR DELETE USING (auth.role() = 'authenticated');

-- Create RLS policies for batches table
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.batches;
CREATE POLICY "Enable read access for all authenticated users" ON public.batches FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.batches;
CREATE POLICY "Enable insert for authenticated users" ON public.batches FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.batches;
CREATE POLICY "Enable update for authenticated users" ON public.batches FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.batches;
CREATE POLICY "Enable delete for authenticated users" ON public.batches FOR DELETE USING (auth.role() = 'authenticated');

-- Create RLS policies for tailor_assignments table
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.tailor_assignments;
CREATE POLICY "Enable read access for all authenticated users" ON public.tailor_assignments FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.tailor_assignments;
CREATE POLICY "Enable insert for authenticated users" ON public.tailor_assignments FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.tailor_assignments;
CREATE POLICY "Enable update for authenticated users" ON public.tailor_assignments FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.tailor_assignments;
CREATE POLICY "Enable delete for authenticated users" ON public.tailor_assignments FOR DELETE USING (auth.role() = 'authenticated');

-- Create RLS policies for tailor_skills table
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.tailor_skills;
CREATE POLICY "Enable read access for all authenticated users" ON public.tailor_skills FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.tailor_skills;
CREATE POLICY "Enable insert for authenticated users" ON public.tailor_skills FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.tailor_skills;
CREATE POLICY "Enable update for authenticated users" ON public.tailor_skills FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.tailor_skills;
CREATE POLICY "Enable delete for authenticated users" ON public.tailor_skills FOR DELETE USING (auth.role() = 'authenticated');

-- Create RLS policies for tailor_attendance table
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.tailor_attendance;
CREATE POLICY "Enable read access for all authenticated users" ON public.tailor_attendance FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.tailor_attendance;
CREATE POLICY "Enable insert for authenticated users" ON public.tailor_attendance FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.tailor_attendance;
CREATE POLICY "Enable update for authenticated users" ON public.tailor_attendance FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.tailor_attendance;
CREATE POLICY "Enable delete for authenticated users" ON public.tailor_attendance FOR DELETE USING (auth.role() = 'authenticated');

-- Create triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_tailors_updated_at ON public.tailors;
CREATE TRIGGER update_tailors_updated_at
    BEFORE UPDATE ON public.tailors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_batches_updated_at ON public.batches;
CREATE TRIGGER update_batches_updated_at
    BEFORE UPDATE ON public.batches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tailor_assignments_updated_at ON public.tailor_assignments;
CREATE TRIGGER update_tailor_assignments_updated_at
    BEFORE UPDATE ON public.tailor_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tailor_skills_updated_at ON public.tailor_skills;
CREATE TRIGGER update_tailor_skills_updated_at
    BEFORE UPDATE ON public.tailor_skills
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tailor_attendance_updated_at ON public.tailor_attendance;
CREATE TRIGGER update_tailor_attendance_updated_at
    BEFORE UPDATE ON public.tailor_attendance
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to update batch capacity
CREATE OR REPLACE FUNCTION update_batch_capacity()
RETURNS TRIGGER AS $$
BEGIN
    -- Update current capacity when tailor is added/removed from batch
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE public.batches 
        SET current_capacity = (
            SELECT COUNT(*) 
            FROM public.tailors 
            WHERE batch_id = NEW.batch_id AND status = 'active'
        )
        WHERE id = NEW.batch_id;
    END IF;
    
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.batch_id IS DISTINCT FROM NEW.batch_id) THEN
        UPDATE public.batches 
        SET current_capacity = (
            SELECT COUNT(*) 
            FROM public.tailors 
            WHERE batch_id = OLD.batch_id AND status = 'active'
        )
        WHERE id = OLD.batch_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

-- Create trigger to update batch capacity
DROP TRIGGER IF EXISTS trigger_update_batch_capacity ON public.tailors;
CREATE TRIGGER trigger_update_batch_capacity
    AFTER INSERT OR UPDATE OR DELETE ON public.tailors
    FOR EACH ROW
    EXECUTE FUNCTION update_batch_capacity();

-- Insert sample data
INSERT INTO public.batches (batch_name, batch_code, tailor_type, max_capacity, description) VALUES
('Single Needle Batch A', 'SN-A001', 'single_needle', 8, 'Primary single needle batch for basic stitching'),
('Single Needle Batch B', 'SN-B001', 'single_needle', 6, 'Secondary single needle batch for complex work'),
('Overlock Batch X', 'OL-X001', 'overlock_flatlock', 10, 'Main overlock batch for finishing work'),
('Overlock Batch Y', 'OL-Y001', 'overlock_flatlock', 8, 'Secondary overlock batch for bulk orders')
ON CONFLICT (batch_name) DO NOTHING;

-- Insert sample tailors
INSERT INTO public.tailors (
    tailor_code, full_name, tailor_type, skill_level, batch_id, is_batch_leader,
    personal_phone, personal_email, joining_date, employment_type, salary
) VALUES
('T001', 'Rajesh Kumar', 'single_needle', 'expert', (SELECT id FROM public.batches WHERE batch_code = 'SN-A001'), true, '9876543210', 'rajesh@example.com', '2023-01-15', 'Full-time', 25000),
('T002', 'Priya Sharma', 'single_needle', 'advanced', (SELECT id FROM public.batches WHERE batch_code = 'SN-A001'), false, '9876543211', 'priya@example.com', '2023-02-01', 'Full-time', 22000),
('T003', 'Amit Singh', 'overlock_flatlock', 'expert', (SELECT id FROM public.batches WHERE batch_code = 'OL-X001'), true, '9876543212', 'amit@example.com', '2023-01-20', 'Full-time', 28000),
('T004', 'Sunita Devi', 'overlock_flatlock', 'intermediate', (SELECT id FROM public.batches WHERE batch_code = 'OL-X001'), false, '9876543213', 'sunita@example.com', '2023-03-01', 'Full-time', 20000),
('T005', 'Vikram Patel', 'single_needle', 'beginner', (SELECT id FROM public.batches WHERE batch_code = 'SN-B001'), false, '9876543214', 'vikram@example.com', '2023-04-15', 'Full-time', 18000)
ON CONFLICT (tailor_code) DO NOTHING;

-- Update batch leaders in batches table
UPDATE public.batches 
SET batch_leader_id = (SELECT id FROM public.tailors WHERE tailor_code = 'T001')
WHERE batch_code = 'SN-A001';

UPDATE public.batches 
SET batch_leader_id = (SELECT id FROM public.tailors WHERE tailor_code = 'T003')
WHERE batch_code = 'OL-X001';

-- Insert sample skills
INSERT INTO public.tailor_skills (tailor_id, skill_name, proficiency_level, years_of_experience, certified) VALUES
((SELECT id FROM public.tailors WHERE tailor_code = 'T001'), 'Basic Stitching', 'expert', 8.0, true),
((SELECT id FROM public.tailors WHERE tailor_code = 'T001'), 'Pattern Making', 'advanced', 5.0, true),
((SELECT id FROM public.tailors WHERE tailor_code = 'T002'), 'Basic Stitching', 'advanced', 4.0, true),
((SELECT id FROM public.tailors WHERE tailor_code = 'T003'), 'Overlock Stitching', 'expert', 10.0, true),
((SELECT id FROM public.tailors WHERE tailor_code = 'T003'), 'Flatlock Stitching', 'expert', 8.0, true),
((SELECT id FROM public.tailors WHERE tailor_code = 'T004'), 'Overlock Stitching', 'intermediate', 2.0, false),
((SELECT id FROM public.tailors WHERE tailor_code = 'T005'), 'Basic Stitching', 'beginner', 0.5, false)
ON CONFLICT (tailor_id, skill_name) DO NOTHING;

-- Use existing avatars bucket for tailor avatars
-- The avatars bucket should already exist and have proper policies

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
