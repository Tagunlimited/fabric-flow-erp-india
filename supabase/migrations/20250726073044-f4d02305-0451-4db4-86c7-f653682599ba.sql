-- Fix the security issue by updating the RLS policy that references user metadata
-- Remove the insecure policy and replace it with a secure one

-- First, drop the problematic policy
DROP POLICY IF EXISTS "Enable admin access to all profiles" ON public.profiles;

-- Create a security definer function to check admin status
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  );
$$;

-- Create a new secure admin policy using the function
CREATE POLICY "Admins can access all profiles" 
ON public.profiles 
FOR ALL 
USING (public.is_admin());