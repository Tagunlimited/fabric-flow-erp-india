-- ============================================================================
-- FIX: Purchase Order Items Schema for Multi-Supplier PO
-- Generated: January 8, 2025
-- Description: Ensures purchase_order_items table has all required columns with proper defaults
-- ============================================================================

-- ============================================================================
-- PART 1: DIAGNOSE THE CURRENT STATE
-- ============================================================================

-- Check what columns currently exist in purchase_order_items table
SELECT 'Current purchase_order_items table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'purchase_order_items' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================================================
-- PART 2: ENSURE ALL REQUIRED COLUMNS EXIST WITH DEFAULTS
-- ============================================================================

-- Add missing columns with defaults to purchase_order_items
ALTER TABLE purchase_order_items 
ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_price DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS gst_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS line_total DECIMAL(15,2) DEFAULT 0;

-- Remove NOT NULL constraints if they exist (to allow database defaults)
ALTER TABLE purchase_order_items 
ALTER COLUMN unit_price DROP NOT NULL,
ALTER COLUMN total_price DROP NOT NULL,
ALTER COLUMN line_total DROP NOT NULL;

-- ============================================================================
-- PART 3: VERIFY THE FIX
-- ============================================================================

-- Verify the table structure after changes
SELECT 'Updated purchase_order_items table structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'purchase_order_items' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Test insert with minimal data (should work with defaults)
DO $$
DECLARE
    test_po_id UUID;
    test_item_id UUID;
BEGIN
    -- Get a test PO ID (use the first available)
    SELECT id INTO test_po_id FROM purchase_orders LIMIT 1;
    
    IF test_po_id IS NOT NULL THEN
        -- Test insert with minimal required fields only
        INSERT INTO purchase_order_items (
            po_id,
            item_type,
            item_name,
            quantity
        ) VALUES (
            test_po_id,
            'item',
            'Test Item',
            1
        ) RETURNING id INTO test_item_id;
        
        -- Clean up test record
        DELETE FROM purchase_order_items WHERE id = test_item_id;
        
        RAISE NOTICE 'SUCCESS: purchase_order_items table is working correctly with defaults';
    ELSE
        RAISE NOTICE 'WARNING: No purchase orders found to test with';
    END IF;
END $$;
