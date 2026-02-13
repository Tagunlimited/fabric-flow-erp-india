-- Complete fix for inventory adjustment system
-- Fixes:
-- 1. Missing updated_at column in inventory_adjustments table
-- 2. RLS policy on inventory_adjustment_logs that only allows SELECT

-- ============================================================================
-- PART 1: Add updated_at column to inventory_adjustments
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_adjustments' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE inventory_adjustments 
    ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    
    -- Update existing records to have updated_at = created_at
    UPDATE inventory_adjustments
    SET updated_at = created_at
    WHERE updated_at IS NULL;
  END IF;
END $$;

-- Create or replace trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_inventory_adjustments_updated_at ON inventory_adjustments;

-- Create trigger for updated_at on inventory_adjustments
CREATE TRIGGER update_inventory_adjustments_updated_at 
    BEFORE UPDATE ON inventory_adjustments 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 2: Fix RLS policy for inventory_adjustment_logs
-- ============================================================================

-- Drop ALL existing policies on inventory_adjustment_logs to avoid conflicts
DROP POLICY IF EXISTS "Authenticated users can view adjustment logs" ON inventory_adjustment_logs;
DROP POLICY IF EXISTS "Authenticated users can manage adjustment logs" ON inventory_adjustment_logs;

-- Create a comprehensive policy that allows both SELECT and INSERT for authenticated users
CREATE POLICY "Authenticated users can manage adjustment logs"
  ON inventory_adjustment_logs FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Grant necessary permissions
GRANT INSERT, SELECT ON inventory_adjustment_logs TO authenticated;
GRANT INSERT, SELECT ON inventory_adjustment_logs TO service_role;

-- ============================================================================
-- PART 3: Comments
-- ============================================================================

COMMENT ON COLUMN inventory_adjustments.updated_at IS 
  'Timestamp when the adjustment record was last updated. Automatically maintained by trigger.';

COMMENT ON POLICY "Authenticated users can manage adjustment logs" ON inventory_adjustment_logs IS 
  'Allows authenticated users to view and insert inventory adjustment logs. The execute_inventory_adjustment function uses this policy when inserting logs.';

