-- Create production_team table
CREATE TABLE IF NOT EXISTS production_team (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_code VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(20) NOT NULL,
    personal_email VARCHAR(255),
    personal_phone VARCHAR(20) NOT NULL,
    address_line1 TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    designation VARCHAR(100) NOT NULL CHECK (designation IN ('Pattern Master', 'Cutting Manager', 'Tailor')),
    joining_date DATE NOT NULL,
    employment_type VARCHAR(50) DEFAULT 'Full-time',
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_production_team_designation ON production_team(designation);
CREATE INDEX IF NOT EXISTS idx_production_team_employee_code ON production_team(employee_code);

-- Insert sample data
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
    joining_date, 
    employment_type
) VALUES 
('PT001', 'Rajesh Kumar', '1985-03-15', 'Male', 'rajesh.kumar@example.com', '+91-9876543210', '123 Main Street', 'Mumbai', 'Maharashtra', '400001', 'Pattern Master', '2020-01-15', 'Full-time'),
('PT002', 'Priya Sharma', '1990-07-22', 'Female', 'priya.sharma@example.com', '+91-9876543211', '456 Park Avenue', 'Delhi', 'Delhi', '110001', 'Cutting Manager', '2019-06-10', 'Full-time'),
('PT003', 'Amit Patel', '1988-11-08', 'Male', 'amit.patel@example.com', '+91-9876543212', '789 Lake Road', 'Ahmedabad', 'Gujarat', '380001', 'Tailor', '2021-03-20', 'Full-time'),
('PT004', 'Sunita Verma', '1992-04-12', 'Female', 'sunita.verma@example.com', '+91-9876543213', '321 Garden Street', 'Bangalore', 'Karnataka', '560001', 'Pattern Master', '2018-09-05', 'Full-time'),
('PT005', 'Vikram Singh', '1987-12-30', 'Male', 'vikram.singh@example.com', '+91-9876543214', '654 Hill View', 'Chennai', 'Tamil Nadu', '600001', 'Cutting Manager', '2020-11-18', 'Full-time'),
('PT006', 'Meera Reddy', '1991-08-25', 'Female', 'meera.reddy@example.com', '+91-9876543215', '987 Beach Road', 'Hyderabad', 'Telangana', '500001', 'Tailor', '2022-01-30', 'Full-time'),
('PT007', 'Arun Kumar', '1986-05-18', 'Male', 'arun.kumar@example.com', '+91-9876543216', '147 Temple Street', 'Pune', 'Maharashtra', '411001', 'Pattern Master', '2019-12-03', 'Full-time'),
('PT008', 'Kavita Joshi', '1993-01-14', 'Female', 'kavita.joshi@example.com', '+91-9876543217', '258 Market Road', 'Jaipur', 'Rajasthan', '302001', 'Tailor', '2021-07-12', 'Full-time');

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_production_team_updated_at 
    BEFORE UPDATE ON production_team 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
