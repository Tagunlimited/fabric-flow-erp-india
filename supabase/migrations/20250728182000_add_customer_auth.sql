-- Add customer authentication and role-based access

-- Create customer_users table to link customers with auth users
CREATE TABLE IF NOT EXISTS customer_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(customer_id, user_id)
);

-- Add customer role to user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'customer';

-- Create customer portal settings table
CREATE TABLE IF NOT EXISTS customer_portal_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    can_view_orders BOOLEAN DEFAULT true,
    can_view_invoices BOOLEAN DEFAULT true,
    can_view_quotations BOOLEAN DEFAULT true,
    can_view_production_status BOOLEAN DEFAULT true,
    can_download_documents BOOLEAN DEFAULT true,
    can_request_changes BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create customer activity log
CREATE TABLE IF NOT EXISTS customer_activity_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS policies for customer data access
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_activity_log ENABLE ROW LEVEL SECURITY;

-- Policy for customers to see only their orders
CREATE POLICY "Customers can view own orders" ON orders
    FOR SELECT USING (
        customer_id IN (
            SELECT customer_id FROM customer_users 
            WHERE user_id = auth.uid()
        )
    );

-- Policy for customers to see only their invoices
CREATE POLICY "Customers can view own invoices" ON invoices
    FOR SELECT USING (
        customer_id IN (
            SELECT customer_id FROM customer_users 
            WHERE user_id = auth.uid()
        )
    );

-- Policy for customers to see only their quotations
CREATE POLICY "Customers can view own quotations" ON quotations
    FOR SELECT USING (
        customer_id IN (
            SELECT customer_id FROM customer_users 
            WHERE user_id = auth.uid()
        )
    );

-- Policy for customers to see only their activity log
CREATE POLICY "Customers can view own activity" ON customer_activity_log
    FOR SELECT USING (
        customer_id IN (
            SELECT customer_id FROM customer_users 
            WHERE user_id = auth.uid()
        )
    );

-- Function to create customer user
CREATE OR REPLACE FUNCTION create_customer_user(
    customer_email TEXT,
    customer_password TEXT,
    customer_id UUID
) RETURNS UUID AS $$
DECLARE
    new_user_id UUID;
BEGIN
    -- Create auth user
    INSERT INTO auth.users (
        email,
        encrypted_password,
        email_confirmed_at,
        created_at,
        updated_at
    ) VALUES (
        customer_email,
        crypt(customer_password, gen_salt('bf')),
        NOW(),
        NOW(),
        NOW()
    ) RETURNING id INTO new_user_id;

    -- Link to customer
    INSERT INTO customer_users (customer_id, user_id)
    VALUES (customer_id, new_user_id);

    -- Create profile
    INSERT INTO profiles (user_id, email, full_name, role)
    VALUES (new_user_id, customer_email, 'Customer', 'customer');

    RETURN new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 