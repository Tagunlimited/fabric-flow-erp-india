/*
  # Create roles and user_roles tables

  1. New Tables
    - `roles`
      - `id` (uuid, primary key)
      - `name` (text, unique, not null)
      - `description` (text)
      - `created_at` (timestamp)
    - `user_roles`
      - `user_id` (uuid, foreign key to auth.users)
      - `role_id` (uuid, foreign key to roles)
      - `assigned_by` (uuid, foreign key to auth.users)
      - `assigned_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to manage roles

  3. Data
    - Insert default roles from user_role enum
*/

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- Create user_roles junction table
CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  assigned_by uuid,
  assigned_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Create policies for roles table
CREATE POLICY "Authenticated users can view all roles"
  ON roles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage roles"
  ON roles
  FOR ALL
  TO authenticated
  USING (true);

-- Create policies for user_roles table
CREATE POLICY "Authenticated users can view all user roles"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage user roles"
  ON user_roles
  FOR ALL
  TO authenticated
  USING (true);

-- Insert default roles based on user_role enum
INSERT INTO roles (name, description) VALUES
  ('admin', 'System Administrator'),
  ('sales', 'Sales Team Member'),
  ('production', 'Production Team Member'),
  ('quality', 'Quality Control Team Member'),
  ('dispatch', 'Dispatch Team Member'),
  ('manager', 'Manager')
ON CONFLICT (name) DO NOTHING;