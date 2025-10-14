-- Check and fix customer_types table
-- This script will ensure the customer_types table exists with the correct data

-- First, check if customer_types table exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'customer_types') THEN
        -- Create customer_types table if it doesn't exist
        CREATE TABLE customer_types (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            discount_percentage DECIMAL(5,2) DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        -- Insert default customer types
        INSERT INTO customer_types (name, description, discount_percentage) VALUES
            ('Wholesale', 'Wholesale customers', 15.00),
            ('Retail', 'Retail customers', 5.00),
            ('Ecommerce', 'Online platform customers', 10.00),
            ('Staff', 'Company staff purchases', 25.00);
            
        RAISE NOTICE 'Created customer_types table with default data';
    ELSE
        RAISE NOTICE 'customer_types table already exists';
    END IF;
END $$;

-- Check current data in customer_types table
SELECT 'Current customer_types data:' as info;
SELECT id, name, description, discount_percentage FROM customer_types ORDER BY id;

-- Check if states table exists and has data
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'states') THEN
        -- Create states table if it doesn't exist
        CREATE TABLE states (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            code TEXT NOT NULL UNIQUE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        -- Insert Indian states
        INSERT INTO states (name, code) VALUES
            ('Andhra Pradesh', 'AP'),
            ('Arunachal Pradesh', 'AR'),
            ('Assam', 'AS'),
            ('Bihar', 'BR'),
            ('Chhattisgarh', 'CG'),
            ('Delhi', 'DL'),
            ('Goa', 'GA'),
            ('Gujarat', 'GJ'),
            ('Haryana', 'HR'),
            ('Himachal Pradesh', 'HP'),
            ('Jharkhand', 'JH'),
            ('Karnataka', 'KA'),
            ('Kerala', 'KL'),
            ('Madhya Pradesh', 'MP'),
            ('Maharashtra', 'MH'),
            ('Manipur', 'MN'),
            ('Meghalaya', 'ML'),
            ('Mizoram', 'MZ'),
            ('Nagaland', 'NL'),
            ('Odisha', 'OR'),
            ('Punjab', 'PB'),
            ('Rajasthan', 'RJ'),
            ('Sikkim', 'SK'),
            ('Tamil Nadu', 'TN'),
            ('Telangana', 'TS'),
            ('Tripura', 'TR'),
            ('Uttar Pradesh', 'UP'),
            ('Uttarakhand', 'UK'),
            ('West Bengal', 'WB');
            
        RAISE NOTICE 'Created states table with default data';
    ELSE
        RAISE NOTICE 'states table already exists';
    END IF;
END $$;

-- Check current data in states table
SELECT 'Current states data (first 10):' as info;
SELECT id, name, code FROM states ORDER BY id LIMIT 10;

-- Check customers table structure
SELECT 'Customers table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'customers' AND column_name IN ('customer_type_id', 'state_id')
ORDER BY ordinal_position;

-- Test customer insert with valid data
SELECT 'Testing customer insert with valid data...' as info;

-- This will show if the foreign key constraints are working
-- You can uncomment and run this to test:
/*
INSERT INTO customers (
    company_name,
    gstin,
    mobile,
    email,
    customer_type_id,
    address,
    city,
    state_id,
    pincode,
    loyalty_points
) VALUES (
    'Test Company',
    'GSTIN123456789',
    '9876543210',
    'test@example.com',
    1,  -- Customer Type ID 1 = Wholesale
    '123 Test Street',
    'Mumbai',
    15, -- State ID 15 = Maharashtra
    '400001',
    0
);
*/
