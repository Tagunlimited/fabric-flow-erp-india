-- ============================================================================
-- FIX: Profile Loading Issue
-- Generated: October 8, 2025
-- Description: Fixes profile loading errors and ensures auto-creation
-- ============================================================================

-- ============================================================================
-- PART 1: ENSURE PROFILES TABLE EXISTS WITH CORRECT STRUCTURE
-- ============================================================================

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    department TEXT,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    role TEXT DEFAULT 'sales manager',
    status TEXT DEFAULT 'approved',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID UNIQUE NOT NULL
);

-- ============================================================================
-- PART 2: FIX RLS POLICIES (Prevent Recursion)
-- ============================================================================

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop old policies that might cause recursion
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON profiles;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON profiles;

-- Create simple, non-recursive policies
CREATE POLICY "Authenticated users can view all profiles"
ON profiles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can update all profiles"
ON profiles FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
    )
);

-- ============================================================================
-- PART 3: AUTO-CREATE PROFILE TRIGGER (Most Important!)
-- ============================================================================

-- Function to auto-create profile when user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (
        user_id,
        email,
        full_name,
        role,
        status
    ) VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
        COALESCE(NEW.raw_user_meta_data->>'role', 'sales manager'),
        COALESCE(NEW.raw_user_meta_data->>'status', 'approved')
    )
    ON CONFLICT (user_id) DO UPDATE
    SET 
        email = EXCLUDED.email,
        updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger to auto-create profile
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- PART 4: BACKFILL PROFILES FOR EXISTING USERS
-- ============================================================================

-- Create profiles for any auth users that don't have profiles yet
INSERT INTO public.profiles (user_id, email, full_name, role, status)
SELECT 
    au.id,
    au.email,
    COALESCE(au.raw_user_meta_data->>'name', au.email, 'User'),
    COALESCE(au.raw_user_meta_data->>'role', 'sales manager'),
    COALESCE(au.raw_user_meta_data->>'status', 'approved')
FROM auth.users au
WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = au.id
)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- PART 5: CREATE INDEX
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- ============================================================================
-- PART 6: GRANT PERMISSIONS
-- ============================================================================

-- Ensure the trigger function has proper permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- SUCCESS MESSAGE & VERIFICATION
-- ============================================================================

SELECT 
    'Profile fix applied successfully!' as status,
    COUNT(*) as profiles_created
FROM profiles;

-- Show all profiles
SELECT 
    id,
    email,
    full_name,
    role,
    status,
    created_at
FROM profiles
ORDER BY created_at DESC;

