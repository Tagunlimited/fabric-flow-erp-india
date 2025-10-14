-- Fix customers table structure to match the code expectations
-- This script will update your existing customers table

-- First, let's see what we have
SELECT 'Current customers table structure:' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'customers' 
ORDER BY ordinal_position;

-- Step 1: Create customer_types table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'customer_types') THEN
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

-- Step 2: Create states table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'states') THEN
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

-- Step 3: Add new columns to customers table
DO $$
BEGIN
    -- Add customer_type_id column if it doesn't exist
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'customer_type_id') THEN
        ALTER TABLE customers ADD COLUMN customer_type_id INTEGER REFERENCES customer_types(id);
        RAISE NOTICE 'Added customer_type_id column';
    ELSE
        RAISE NOTICE 'customer_type_id column already exists';
    END IF;
    
    -- Add state_id column if it doesn't exist
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'state_id') THEN
        ALTER TABLE customers ADD COLUMN state_id INTEGER REFERENCES states(id);
        RAISE NOTICE 'Added state_id column';
    ELSE
        RAISE NOTICE 'state_id column already exists';
    END IF;
    
    -- Add mobile column if it doesn't exist (rename phone to mobile)
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'mobile') THEN
        ALTER TABLE customers ADD COLUMN mobile TEXT;
        RAISE NOTICE 'Added mobile column';
    ELSE
        RAISE NOTICE 'mobile column already exists';
    END IF;
    
    -- Add loyalty_points column if it doesn't exist
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'loyalty_points') THEN
        ALTER TABLE customers ADD COLUMN loyalty_points INTEGER DEFAULT 0;
        RAISE NOTICE 'Added loyalty_points column';
    ELSE
        RAISE NOTICE 'loyalty_points column already exists';
    END IF;
END $$;

-- Step 4: Update existing data to populate the new columns
UPDATE customers 
SET 
    customer_type_id = ct.id,
    state_id = s.id,
    mobile = phone, -- Copy phone to mobile
    loyalty_points = 0
FROM customer_types ct, states s
WHERE 
    customers.customer_type::text = ct.name 
    AND customers.state = s.name;

-- Step 5: Show the updated structure
SELECT 'Updated customers table structure:' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'customers' 
ORDER BY ordinal_position;

-- Step 6: Show sample data
SELECT 'Sample data after update:' as info;
SELECT 
    company_name,
    customer_type,
    customer_type_id,
    state,
    state_id,
    phone,
    mobile
FROM customers 
LIMIT 5;
