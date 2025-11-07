-- ============================================================================
-- Migration: Add bom_id column to purchase_order_items
-- Date: January 7, 2025
-- Description: Adds bom_id column to track which BOM each PO item belongs to
--              This enables proper tracking when a single PO covers multiple BOMs
-- ============================================================================

-- Add bom_id column to purchase_order_items table
ALTER TABLE purchase_order_items 
ADD COLUMN IF NOT EXISTS bom_id UUID REFERENCES bom_records(id);

-- Add index for faster lookups by BOM ID
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_bom_id 
ON purchase_order_items(bom_id);

-- Add remarks column if it doesn't exist (for item notes/remarks)
ALTER TABLE purchase_order_items 
ADD COLUMN IF NOT EXISTS remarks TEXT;

-- Verify the changes
SELECT 'Successfully added bom_id column to purchase_order_items table' as status;

SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'purchase_order_items' 
  AND table_schema = 'public'
  AND column_name IN ('bom_id', 'remarks')
ORDER BY column_name;

