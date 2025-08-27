-- Update production_team table to support hierarchical batch system
ALTER TABLE production_team 
ADD COLUMN tailor_type VARCHAR(50) CHECK (tailor_type IN ('Single Needle', 'Overlock/Flatlock')),
ADD COLUMN batch_leader_id UUID REFERENCES production_team(id),
ADD COLUMN is_batch_leader BOOLEAN DEFAULT FALSE,
ADD COLUMN per_piece_rate DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN avatar_url TEXT;

-- Update existing designation constraint to include new tailor types
ALTER TABLE production_team DROP CONSTRAINT production_team_designation_check;
ALTER TABLE production_team ADD CONSTRAINT production_team_designation_check 
CHECK (designation IN ('Pattern Master', 'Cutting Manager', 'Single Needle Tailor', 'Overlock/Flatlock Tailor'));

-- Create index for batch leader queries
CREATE INDEX IF NOT EXISTS idx_production_team_batch_leader ON production_team(batch_leader_id);
CREATE INDEX IF NOT EXISTS idx_production_team_tailor_type ON production_team(tailor_type);
CREATE INDEX IF NOT EXISTS idx_production_team_is_batch_leader ON production_team(is_batch_leader);

-- Update existing sample data to reflect new structure
UPDATE production_team SET 
  designation = 'Single Needle Tailor',
  tailor_type = 'Single Needle',
  is_batch_leader = TRUE,
  per_piece_rate = 25.00
WHERE employee_code = 'PT003';

UPDATE production_team SET 
  designation = 'Single Needle Tailor',
  tailor_type = 'Single Needle',
  is_batch_leader = FALSE,
  batch_leader_id = (SELECT id FROM production_team WHERE employee_code = 'PT003'),
  per_piece_rate = 20.00
WHERE employee_code = 'PT006';

UPDATE production_team SET 
  designation = 'Overlock/Flatlock Tailor',
  tailor_type = 'Overlock/Flatlock',
  is_batch_leader = TRUE,
  per_piece_rate = 30.00
WHERE employee_code = 'PT008';

-- Add new sample batch leaders and tailors
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
    per_piece_rate,
    joining_date, 
    employment_type
) VALUES 
('PT009', 'Ramesh Kumar', '1985-09-15', 'Male', 'ramesh.kumar@example.com', '+91-9876543218', '369 Industrial Area', 'Surat', 'Gujarat', '395001', 'Single Needle Tailor', 'Single Needle', TRUE, 28.00, '2020-03-15', 'Full-time'),
('PT010', 'Lakshmi Devi', '1990-12-08', 'Female', 'lakshmi.devi@example.com', '+91-9876543219', '741 Textile Colony', 'Tirupur', 'Tamil Nadu', '641601', 'Overlock/Flatlock Tailor', 'Overlock/Flatlock', TRUE, 32.00, '2019-08-20', 'Full-time'),
('PT011', 'Suresh Patel', '1988-04-22', 'Male', 'suresh.patel@example.com', '+91-9876543220', '852 Garment Street', 'Ludhiana', 'Punjab', '141001', 'Single Needle Tailor', 'Single Needle', FALSE, 22.00, '2021-01-10', 'Full-time'),
('PT012', 'Geeta Sharma', '1992-07-30', 'Female', 'geeta.sharma@example.com', '+91-9876543221', '963 Fashion Road', 'Indore', 'Madhya Pradesh', '452001', 'Overlock/Flatlock Tailor', 'Overlock/Flatlock', FALSE, 28.00, '2022-02-25', 'Full-time');

-- Set batch relationships for new tailors
UPDATE production_team SET 
  batch_leader_id = (SELECT id FROM production_team WHERE employee_code = 'PT009')
WHERE employee_code = 'PT011';

UPDATE production_team SET 
  batch_leader_id = (SELECT id FROM production_team WHERE employee_code = 'PT010')
WHERE employee_code = 'PT012';
