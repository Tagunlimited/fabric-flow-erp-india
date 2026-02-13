-- Add missing columns to fabric_usage_records table
-- This fixes the "Could not find the 'cutting_quantity' column" error

-- Add the missing columns that the component expects
ALTER TABLE fabric_usage_records 
ADD COLUMN IF NOT EXISTS cutting_quantity DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS used_quantity DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS used_for_cutting_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS used_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS used_by_name TEXT;

-- Add comments for documentation
COMMENT ON COLUMN fabric_usage_records.cutting_quantity IS 'Number of pieces cut using this fabric';
COMMENT ON COLUMN fabric_usage_records.used_quantity IS 'Quantity of fabric used (meters/units)';
COMMENT ON COLUMN fabric_usage_records.used_for_cutting_date IS 'Date when fabric was used for cutting operation';
COMMENT ON COLUMN fabric_usage_records.used_by_id IS 'User who used the fabric for cutting';
COMMENT ON COLUMN fabric_usage_records.used_by_name IS 'Name of user who used the fabric for cutting';

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_fabric_usage_records_cutting_quantity ON fabric_usage_records(cutting_quantity);
CREATE INDEX IF NOT EXISTS idx_fabric_usage_records_used_by_id ON fabric_usage_records(used_by_id);
CREATE INDEX IF NOT EXISTS idx_fabric_usage_records_used_for_cutting_date ON fabric_usage_records(used_for_cutting_date);
