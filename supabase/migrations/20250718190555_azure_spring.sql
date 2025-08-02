/*
  # Create Superadmin User

  1. Security
    - Creates the superadmin user with encrypted password
    - Sets up the profile with admin role
    - Ensures proper authentication flow

  2. Changes
    - Insert superadmin into auth.users
    - Create corresponding profile record
    - Set status as approved
*/

-- Insert superadmin user
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  role
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'ecom@tagunlimitedclothing.com',
  crypt('31Jan@2022', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{"name": "Super Admin", "status": "approved"}',
  false,
  'authenticated'
) ON CONFLICT (email) DO NOTHING;

-- Create profile for superadmin
INSERT INTO public.profiles (
  user_id,
  full_name,
  email,
  role,
  department,
  status,
  created_at,
  updated_at
) 
SELECT 
  id,
  'Super Admin',
  'ecom@tagunlimitedclothing.com',
  'admin',
  'Administration',
  'approved',
  NOW(),
  NOW()
FROM auth.users 
WHERE email = 'ecom@tagunlimitedclothing.com'
ON CONFLICT (user_id) DO UPDATE SET
  role = 'admin',
  status = 'approved',
  updated_at = NOW();