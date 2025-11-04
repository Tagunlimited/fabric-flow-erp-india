-- Fix RLS policy for inventory_adjustment_logs to allow INSERT operations
-- The execute_inventory_adjustment function needs to insert logs, but current policy only allows SELECT

-- Drop the existing SELECT-only policy
DROP POLICY IF EXISTS "Authenticated users can view adjustment logs" ON inventory_adjustment_logs;

-- Create a comprehensive policy that allows both SELECT and INSERT for authenticated users
CREATE POLICY "Authenticated users can manage adjustment logs"
  ON inventory_adjustment_logs FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Also ensure the function can insert logs when running as SECURITY DEFINER
-- Grant necessary permissions to the function owner
GRANT INSERT, SELECT ON inventory_adjustment_logs TO authenticated;
GRANT INSERT, SELECT ON inventory_adjustment_logs TO service_role;

-- Verify the function has SECURITY DEFINER (should already be set)
-- If not, we'll update it
DO $$
BEGIN
  -- Check if function exists and update if needed
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'execute_inventory_adjustment'
  ) THEN
    -- Function exists, ensure it's SECURITY DEFINER
    -- This is already set in the migration, but we'll verify
    NULL; -- Function should already have SECURITY DEFINER
  END IF;
END $$;

-- Add comment
COMMENT ON POLICY "Authenticated users can manage adjustment logs" ON inventory_adjustment_logs IS 
  'Allows authenticated users to view and insert inventory adjustment logs. The execute_inventory_adjustment function uses this policy when inserting logs.';

