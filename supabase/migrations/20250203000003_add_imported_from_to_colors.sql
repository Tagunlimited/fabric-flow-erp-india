-- Migration: Add imported_from column to colors table
-- This column tracks which master table the color was imported from

ALTER TABLE colors 
ADD COLUMN IF NOT EXISTS imported_from TEXT;

-- Add comment to column
COMMENT ON COLUMN colors.imported_from IS 'Source master table: fabric_master, item_master, or product_master';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_colors_imported_from ON colors(imported_from);

