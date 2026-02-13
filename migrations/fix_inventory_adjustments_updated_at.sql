-- Fix missing updated_at column in inventory_adjustments table
-- The execute_inventory_adjustment function updates the status, which triggers
-- the updated_at column update, but the column doesn't exist

-- Add updated_at column if it doesn't exist
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

-- Add comment
COMMENT ON COLUMN inventory_adjustments.updated_at IS 
  'Timestamp when the adjustment record was last updated. Automatically maintained by trigger.';

