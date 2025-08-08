-- Function to create customer user account
CREATE OR REPLACE FUNCTION create_customer_portal_user(
    customer_email TEXT,
    customer_password TEXT,
    customer_id UUID,
    customer_name TEXT
) RETURNS UUID AS $$
DECLARE
    new_user_id UUID;
    hashed_password TEXT;
BEGIN
    -- Hash the password
    hashed_password := crypt(customer_password, gen_salt('bf'));
    
    -- Create auth user directly in auth.users table
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        created_at,
        updated_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        customer_email,
        hashed_password,
        NOW(),
        NOW(),
        NOW(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"' || customer_name || '","role":"customer"}',
        false,
        '',
        '',
        '',
        ''
    ) RETURNING id INTO new_user_id;

    -- Create profile
    INSERT INTO profiles (user_id, email, full_name, role)
    VALUES (new_user_id, customer_email, customer_name, 'customer');

    -- Link to customer
    INSERT INTO customer_users (customer_id, user_id)
    VALUES (customer_id, new_user_id);

    RETURN new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 