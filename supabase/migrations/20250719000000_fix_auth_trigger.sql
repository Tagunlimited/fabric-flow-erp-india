-- Fix the auth trigger to work with our employee access management
-- This migration fixes the "Database error saving new user" issue

-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create a new function that handles our data correctly
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create profile if we have the required metadata
    IF NEW.raw_user_meta_data IS NOT NULL 
       AND NEW.raw_user_meta_data->>'full_name' IS NOT NULL 
       AND NEW.raw_user_meta_data->>'role' IS NOT NULL THEN
        
        INSERT INTO public.profiles (
            user_id, 
            full_name, 
            email, 
            role, 
            phone,
            department,
            status
        )
        VALUES (
            NEW.id,
            NEW.raw_user_meta_data->>'full_name',
            NEW.email,
            (NEW.raw_user_meta_data->>'role')::user_role,
            NEW.raw_user_meta_data->>'phone',
            NEW.raw_user_meta_data->>'department',
            COALESCE(NEW.raw_user_meta_data->>'status', 'approved')
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Add a policy to allow profile creation during signup
DROP POLICY IF EXISTS "Allow profile creation during signup" ON public.profiles;
CREATE POLICY "Allow profile creation during signup" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- Ensure admins can insert profiles
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
CREATE POLICY "Admins can insert profiles" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE user_id = auth.uid() 
            AND role = 'admin' 
            AND status = 'approved'
        )
    );
