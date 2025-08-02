/*
  # Update Profiles Table for Authentication

  1. New Columns
    - Add status column for user approval workflow
    - Add indexes for better performance

  2. Security
    - Update RLS policies for new status field
    - Ensure proper access control

  3. Changes
    - Add status enum and column
    - Update existing records to approved status
    - Create indexes for performance
*/

-- Add status column to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN status TEXT DEFAULT 'pending_approval' 
    CHECK (status IN ('pending_approval', 'approved', 'rejected'));
  END IF;
END $$;

-- Update existing profiles to approved status
UPDATE public.profiles 
SET status = 'approved' 
WHERE status IS NULL OR status = 'pending_approval';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Update RLS policies to include status checks
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = user_id);

-- Admin can view and manage all profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE user_id = auth.uid() 
            AND role = 'admin' 
            AND status = 'approved'
        )
    );

CREATE POLICY "Admins can update all profiles" ON public.profiles
    FOR UPDATE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE user_id = auth.uid() 
            AND role = 'admin' 
            AND status = 'approved'
        )
    );

-- Update the handle_new_user function to set pending status
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, full_name, email, role, status)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
        NEW.email,
        'sales',
        COALESCE(NEW.raw_user_meta_data->>'status', 'pending_approval')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;