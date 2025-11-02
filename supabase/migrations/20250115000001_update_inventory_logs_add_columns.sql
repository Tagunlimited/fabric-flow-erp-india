-- Update inventory_logs table to add missing columns for comprehensive logging
-- This migration adds all the new columns that were added to support removals, adjustments, transfers, etc.

-- Add new columns if they don't exist
ALTER TABLE inventory_logs
ADD COLUMN IF NOT EXISTS old_quantity DECIMAL(10,3),
ADD COLUMN IF NOT EXISTS new_quantity DECIMAL(10,3),
ADD COLUMN IF NOT EXISTS from_bin_id UUID REFERENCES bins(id),
ADD COLUMN IF NOT EXISTS to_bin_id UUID REFERENCES bins(id),
ADD COLUMN IF NOT EXISTS old_status TEXT,
ADD COLUMN IF NOT EXISTS new_status TEXT,
ADD COLUMN IF NOT EXISTS reference_type TEXT,
ADD COLUMN IF NOT EXISTS reference_id UUID,
ADD COLUMN IF NOT EXISTS reference_number TEXT;

-- Update existing action column constraint if needed (postgres doesn't support ALTER ENUM easily, so we use TEXT)
-- The action column should already be TEXT, but let's make sure it can accept all our action types
-- No need to change if it's already TEXT

-- Create additional indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_inventory_logs_action ON inventory_logs(action);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_reference ON inventory_logs(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_from_bin ON inventory_logs(from_bin_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_to_bin ON inventory_logs(to_bin_id);

