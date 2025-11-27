-- Fix RLS policies for colors table to allow all authenticated users
-- Drop ALL existing policies first using DO block to handle any policy names
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop all existing policies on colors table
    FOR r IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'colors' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON colors', r.policyname);
    END LOOP;
END $$;

-- Recreate all policies to allow all authenticated users (only if they don't exist)
DO $$
BEGIN
    -- Check and create read policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'colors' 
        AND schemaname = 'public' 
        AND policyname = 'Allow authenticated users to read colors'
    ) THEN
        CREATE POLICY "Allow authenticated users to read colors"
          ON colors
          FOR SELECT
          TO authenticated
          USING (true);
    END IF;

    -- Check and create insert policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'colors' 
        AND schemaname = 'public' 
        AND policyname = 'Allow authenticated users to insert colors'
    ) THEN
        CREATE POLICY "Allow authenticated users to insert colors"
          ON colors
          FOR INSERT
          TO authenticated
          WITH CHECK (true);
    END IF;

    -- Check and create update policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'colors' 
        AND schemaname = 'public' 
        AND policyname = 'Allow authenticated users to update colors'
    ) THEN
        CREATE POLICY "Allow authenticated users to update colors"
          ON colors
          FOR UPDATE
          TO authenticated
          USING (true)
          WITH CHECK (true);
    END IF;

    -- Check and create delete policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'colors' 
        AND schemaname = 'public' 
        AND policyname = 'Allow authenticated users to delete colors'
    ) THEN
        CREATE POLICY "Allow authenticated users to delete colors"
          ON colors
          FOR DELETE
          TO authenticated
          USING (true);
    END IF;
END $$;

