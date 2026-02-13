-- Create function to create employee user account
-- This version works with Supabase's security model
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.create_employee_user_account(
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT,
    p_role TEXT,
    p_phone TEXT DEFAULT NULL,
    p_department TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_new_user_id UUID;
    v_hashed_password TEXT;
    v_caller_is_admin BOOLEAN;
    v_role_enum TEXT;
BEGIN
    -- Ensure only admins can call this
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
    ) INTO v_caller_is_admin;

    IF NOT v_caller_is_admin THEN
        RAISE EXCEPTION 'Insufficient permissions. Admin access required.';
    END IF;

    IF p_email IS NULL OR p_password IS NULL OR p_full_name IS NULL OR p_role IS NULL THEN
        RAISE EXCEPTION 'Missing required fields';
    END IF;

    -- Normalize incoming role to DB enum values
    SELECT CASE lower(trim(p_role))
        WHEN 'admin' THEN 'admin'
        WHEN 'sales' THEN 'sales manager'
        WHEN 'sales manager' THEN 'sales manager'
        WHEN 'production' THEN 'production manager'
        WHEN 'production manager' THEN 'production manager'
        WHEN 'quality' THEN 'qc manager'
        WHEN 'qc' THEN 'qc manager'
        WHEN 'qc manager' THEN 'qc manager'
        WHEN 'dispatch' THEN 'packaging & dispatch manager'
        WHEN 'packaging & dispatch manager' THEN 'packaging & dispatch manager'
        WHEN 'graphic & printing' THEN 'graphic & printing'
        WHEN 'procurement manager' THEN 'procurement manager'
        WHEN 'cutting master' THEN 'cutting master'
        WHEN 'customer' THEN 'customer'
        WHEN 'employee' THEN 'employee'
        ELSE 'employee'
    END INTO v_role_enum;

    -- Hash the password
    v_hashed_password := crypt(p_password, gen_salt('bf'));

    -- Create auth user directly (SECURITY DEFINER allows this)
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
        p_email,
        v_hashed_password,
        NOW(),
        NOW(),
        NOW(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object(
            'full_name', p_full_name,
            'role', v_role_enum,
            'phone', COALESCE(p_phone, ''),
            'department', COALESCE(p_department, '')
        ),
        false,
        '',
        '',
        '',
        ''
    ) RETURNING id INTO v_new_user_id;

    -- Create profile
    -- Use TEXT for role instead of enum cast (more compatible)
    INSERT INTO public.profiles (
        user_id,
        full_name,
        email,
        role,
        phone,
        department,
        status
    ) VALUES (
        v_new_user_id,
        p_full_name,
        p_email,
        v_role_enum,
        NULLIF(p_phone, ''),
        NULLIF(p_department, ''),
        'approved'
    )
    ON CONFLICT (user_id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        phone = EXCLUDED.phone,
        department = EXCLUDED.department,
        status = 'approved';

    RETURN v_new_user_id;
EXCEPTION
    WHEN unique_violation THEN
        -- User already exists, return existing user_id
        SELECT user_id INTO v_new_user_id
        FROM public.profiles
        WHERE email = p_email
        LIMIT 1;
        
        IF v_new_user_id IS NULL THEN
            RAISE EXCEPTION 'User already exists but profile not found';
        END IF;
        
        -- Update existing profile
        UPDATE public.profiles
        SET full_name = p_full_name,
            role = v_role_enum::TEXT,
            phone = NULLIF(p_phone, ''),
            department = NULLIF(p_department, ''),
            status = 'approved'
        WHERE user_id = v_new_user_id;
        
        RETURN v_new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_employee_user_account(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

