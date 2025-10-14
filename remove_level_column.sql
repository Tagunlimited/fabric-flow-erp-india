-- Remove the level column from designations table if it exists
-- This script is safe to run multiple times

-- Check if level column exists and drop it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'designations' 
    AND column_name = 'level'
  ) THEN
    ALTER TABLE designations DROP COLUMN level;
    RAISE NOTICE 'Level column removed from designations table';
  ELSE
    RAISE NOTICE 'Level column does not exist in designations table';
  END IF;
END $$;

-- Verify the current table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'designations' 
ORDER BY ordinal_position;
