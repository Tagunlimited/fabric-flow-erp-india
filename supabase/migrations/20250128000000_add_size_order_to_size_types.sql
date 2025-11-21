-- Add size_order JSONB field to size_types table
-- This field stores the custom sort order for sizes: { "S": 1, "M": 2, "L": 3, ... }

ALTER TABLE size_types 
ADD COLUMN IF NOT EXISTS size_order JSONB DEFAULT '{}'::jsonb;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_size_types_size_order ON size_types USING GIN (size_order);

-- Add comment to explain the field
COMMENT ON COLUMN size_types.size_order IS 'JSONB object mapping size names to their sort order. Example: {"S": 1, "M": 2, "L": 3, "XL": 4}';

