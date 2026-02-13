-- Check if production_team table exists
SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE table_schema = 'public'
   AND table_name = 'production_team'
);

-- If table doesn't exist, create it
CREATE TABLE IF NOT EXISTS production_team (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_code TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
    gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
    personal_email TEXT,
    personal_phone TEXT NOT NULL,
    address_line1 TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    pincode TEXT NOT NULL,
    designation TEXT NOT NULL CHECK (designation IN ('Pattern Master', 'Cutting Manager', 'Single Needle Tailor', 'Overlock/Flatlock Tailor')),
    tailor_type TEXT CHECK (tailor_type IN ('Single Needle', 'Overlock/Flatlock')),
    batch_leader_id UUID,
    is_batch_leader BOOLEAN DEFAULT FALSE,
    joining_date DATE NOT NULL,
    employment_type TEXT NOT NULL DEFAULT 'Full-time',
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_production_team_employee_code ON production_team(employee_code);
CREATE INDEX IF NOT EXISTS idx_production_team_batch_leader_id ON production_team(batch_leader_id);
CREATE INDEX IF NOT EXISTS idx_production_team_designation ON production_team(designation);

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_production_team_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS update_production_team_updated_at ON production_team;
CREATE TRIGGER update_production_team_updated_at
    BEFORE UPDATE ON production_team
    FOR EACH ROW
    EXECUTE FUNCTION update_production_team_updated_at();

-- Add foreign key constraint if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'production_team_batch_leader_id_fkey'
    ) THEN
        ALTER TABLE production_team 
        ADD CONSTRAINT production_team_batch_leader_id_fkey 
        FOREIGN KEY (batch_leader_id) REFERENCES production_team(id);
    END IF;
END $$;

-- Enable RLS
ALTER TABLE production_team ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS "Enable read access for all users" ON production_team;
CREATE POLICY "Enable read access for all users" ON production_team
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON production_team;
CREATE POLICY "Enable insert for authenticated users only" ON production_team
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable update for authenticated users only" ON production_team;
CREATE POLICY "Enable update for authenticated users only" ON production_team
    FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON production_team;
CREATE POLICY "Enable delete for authenticated users only" ON production_team
    FOR DELETE USING (auth.role() = 'authenticated');

-- Insert sample data if table is empty
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM production_team LIMIT 1) THEN
        INSERT INTO production_team (
            employee_code, 
            full_name, 
            date_of_birth, 
            gender, 
            personal_email, 
            personal_phone, 
            address_line1, 
            city, 
            state, 
            pincode, 
            designation, 
            tailor_type,
            is_batch_leader,
            joining_date, 
            employment_type
        ) VALUES 
        ('PT001', 'Rajesh Kumar', '1985-03-15', 'Male', 'rajesh.kumar@example.com', '+91-9876543210', '123 Garment Street, Industrial Area', 'Mumbai', 'Maharashtra', '400001', 'Pattern Master', NULL, FALSE, '2020-01-15', 'Full-time'),
        ('PT002', 'Priya Sharma', '1990-07-22', 'Female', 'priya.sharma@example.com', '+91-9876543211', '456 Textile Colony, MIDC', 'Pune', 'Maharashtra', '411001', 'Cutting Manager', NULL, FALSE, '2020-02-20', 'Full-time'),
        ('PT003', 'Amit Patel', '1988-11-10', 'Male', 'amit.patel@example.com', '+91-9876543212', '789 Tailor Lane, Industrial Zone', 'Ahmedabad', 'Gujarat', '380001', 'Single Needle Tailor', 'Single Needle', TRUE, '2020-03-10', 'Full-time'),
        ('PT004', 'Sunita Devi', '1992-05-18', 'Female', 'sunita.devi@example.com', '+91-9876543213', '321 Stitch Road, Garment Area', 'Jaipur', 'Rajasthan', '302001', 'Overlock/Flatlock Tailor', 'Overlock/Flatlock', FALSE, '2020-04-05', 'Full-time'),
        ('PT005', 'Vikram Singh', '1987-09-25', 'Male', 'vikram.singh@example.com', '+91-9876543214', '654 Fabric Street, Textile Hub', 'Ludhiana', 'Punjab', '141001', 'Single Needle Tailor', 'Single Needle', FALSE, '2020-05-12', 'Full-time');
        
        -- Update batch leader references
        UPDATE production_team 
        SET batch_leader_id = (SELECT id FROM production_team WHERE employee_code = 'PT003')
        WHERE employee_code IN ('PT004', 'PT005');
    END IF;
END $$;

-- Show table structure
\d production_team;

-- Show sample data
SELECT employee_code, full_name, designation, tailor_type, is_batch_leader, batch_leader_id FROM production_team LIMIT 5;
