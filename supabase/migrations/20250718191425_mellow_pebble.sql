/*
  # Fix infinite recursion in profiles RLS policies

  1. Security Changes
    - Drop all existing policies on profiles table that cause recursion
    - Create simple, non-recursive policies
    - Ensure policies don't reference the same table they're applied to

  2. Policy Structure
    - Simple user access: users can only access their own profile
    - Admin access: separate policy for admin users
    - Profile creation: allow authenticated users to create their own profile
*/

-- Drop all existing policies on profiles table
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Allow profile creation" ON profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

-- Create simple, non-recursive policies
CREATE POLICY "Enable read access for own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Enable update access for own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable insert access for own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create a simple admin policy that doesn't cause recursion
-- This uses a direct check against user metadata instead of querying profiles table
CREATE POLICY "Enable admin access to all profiles"
  ON profiles FOR ALL
  USING (
    (auth.jwt() ->> 'email') = 'ecom@tagunlimitedclothing.com'
    OR 
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Ensure RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;