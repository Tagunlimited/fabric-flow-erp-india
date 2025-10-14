-- Step 1: Create the production_team table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS production_team (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_code VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(10) NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
    personal_email VARCHAR(255),
    personal_phone VARCHAR(20) NOT NULL,
    address_line1 TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    designation VARCHAR(50) NOT NULL CHECK (designation IN ('Pattern Master', 'Cutting Manager', 'Single Needle Tailor', 'Overlock/Flatlock Tailor')),
         tailor_type VARCHAR(50) CHECK (tailor_type IN ('Single Needle', 'Overlock/Flatlock')),
     batch_leader_id UUID,
     is_batch_leader BOOLEAN DEFAULT FALSE,
     joining_date DATE NOT NULL,
    employment_type VARCHAR(20) DEFAULT 'Full-time' CHECK (employment_type IN ('Full-time', 'Part-time', 'Contract', 'Temporary')),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 2: Create indexes (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_production_team_employee_code ON production_team(employee_code);
CREATE INDEX IF NOT EXISTS idx_production_team_designation ON production_team(designation);
CREATE INDEX IF NOT EXISTS idx_production_team_batch_leader ON production_team(batch_leader_id);
CREATE INDEX IF NOT EXISTS idx_production_team_tailor_type ON production_team(tailor_type);
CREATE INDEX IF NOT EXISTS idx_production_team_is_batch_leader ON production_team(is_batch_leader);

-- Step 3: Create trigger function (if it doesn't exist)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Step 4: Create trigger (drop first if exists, then create)
DROP TRIGGER IF EXISTS update_production_team_updated_at ON production_team;
CREATE TRIGGER update_production_team_updated_at 
    BEFORE UPDATE ON production_team 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Step 5: Add foreign key constraint (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_production_team_batch_leader' 
        AND table_name = 'production_team'
    ) THEN
        ALTER TABLE production_team 
        ADD CONSTRAINT fk_production_team_batch_leader 
        FOREIGN KEY (batch_leader_id) REFERENCES production_team(id);
    END IF;
END $$;

-- Step 6: Insert sample data (only if table is empty)
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
        ('PT002', 'Priya Sharma', '1990-07-22', 'Female', 'priya.sharma@example.com', '+91-9876543211', '456 Textile Colony, MIDC', 'Pune', 'Maharashtra', '411001', 'Cutting Manager', NULL, FALSE, '2019-06-10', 'Full-time'),
        ('PT003', 'Amit Patel', '1988-11-08', 'Male', 'amit.patel@example.com', '+91-9876543212', '789 Fashion Road, SEZ', 'Surat', 'Gujarat', '395001', 'Single Needle Tailor', 'Single Needle', TRUE, '2021-03-20', 'Full-time'),
        ('PT004', 'Sunita Devi', '1992-04-12', 'Female', 'sunita.devi@example.com', '+91-9876543213', '321 Stitching Lane, Industrial Park', 'Tirupur', 'Tamil Nadu', '641601', 'Overlock/Flatlock Tailor', 'Overlock/Flatlock', TRUE, '2020-08-15', 'Full-time'),
        ('PT005', 'Vikram Singh', '1987-09-30', 'Male', 'vikram.singh@example.com', '+91-9876543214', '654 Tailor Street, Garment Hub', 'Ludhiana', 'Punjab', '141001', 'Single Needle Tailor', 'Single Needle', FALSE, '2022-01-10', 'Full-time'),
        ('PT006', 'Meera Iyer', '1991-12-05', 'Female', 'meera.iyer@example.com', '+91-9876543215', '987 Sewing Colony, Textile Zone', 'Indore', 'Madhya Pradesh', '452001', 'Overlock/Flatlock Tailor', 'Overlock/Flatlock', FALSE, '2021-11-25', 'Full-time');

        -- Set batch relationships for tailors
        UPDATE production_team SET 
            batch_leader_id = (SELECT id FROM production_team WHERE employee_code = 'PT003')
        WHERE employee_code = 'PT005';

        UPDATE production_team SET 
            batch_leader_id = (SELECT id FROM production_team WHERE employee_code = 'PT004')
        WHERE employee_code = 'PT006';
    END IF;
END $$;

-- Step 7: Enable Row Level Security (if not already enabled)
ALTER TABLE production_team ENABLE ROW LEVEL SECURITY;

-- Step 8: Create RLS policies (drop first if exist, then create)
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON production_team;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON production_team;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON production_team;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON production_team;

CREATE POLICY "Enable read access for authenticated users" ON production_team
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON production_team
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON production_team
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON production_team
    FOR DELETE USING (auth.role() = 'authenticated');
