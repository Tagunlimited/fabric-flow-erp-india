-- Fix: column raw_user_meta_data is jsonb but string concat yields text (PG / Supabase strict typing).
-- Use jsonb literals and jsonb_build_object so inserts into auth.users type-check.
-- profiles.role is TEXT on many deployments (no public.user_role enum); insert v_role_enum without enum cast.

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
        ELSE NULL
    END INTO v_role_enum;

    IF v_role_enum IS NULL THEN
        RAISE EXCEPTION 'Invalid role: %', p_role;
    END IF;

    v_hashed_password := crypt(p_password, gen_salt('bf'));

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
        '00000000-0000-0000-0000-000000000000'::uuid,
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        p_email,
        v_hashed_password,
        NOW(),
        NOW(),
        NOW(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object(
            'full_name', p_full_name,
            'role', v_role_enum,
            'phone', coalesce(p_phone, ''),
            'department', coalesce(p_department, '')
        ),
        false,
        '',
        '',
        '',
        ''
    ) RETURNING id INTO v_new_user_id;

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
    );

    RETURN v_new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
