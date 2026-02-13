-- ============================================================================
-- Complete Fix for Inventory Adjustment Database Schema
-- Run this in Supabase SQL Editor to fix all schema issues
-- ============================================================================

-- Step 1: Fix inventory_adjustments table
-- Make adjusted_by nullable
ALTER TABLE inventory_adjustments 
ALTER COLUMN adjusted_by DROP NOT NULL;

-- Add adjusted_by_user_id column if it doesn't exist
ALTER TABLE inventory_adjustments 
ADD COLUMN IF NOT EXISTS adjusted_by_user_id UUID;

-- Step 2: Fix inventory_adjustment_logs table
-- Make adjusted_by nullable
ALTER TABLE inventory_adjustment_logs 
ALTER COLUMN adjusted_by DROP NOT NULL;

-- Add adjusted_by_user_id column if it doesn't exist
ALTER TABLE inventory_adjustment_logs 
ADD COLUMN IF NOT EXISTS adjusted_by_user_id UUID;

-- Step 3: Update execute_inventory_adjustment function
-- This function handles the new schema with nullable adjusted_by and adjusted_by_user_id
CREATE OR REPLACE FUNCTION execute_inventory_adjustment(
  p_adjustment_id UUID,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_adjustment RECORD;
  v_item RECORD;
  v_bin_adjustment RECORD;
  v_inventory_record RECORD;
  v_current_stock DECIMAL(10,2);
  v_new_stock DECIMAL(10,2);
  v_bin_current_qty DECIMAL(10,2);
  v_bin_new_qty DECIMAL(10,2);
  v_user_name TEXT;
  v_product_details JSONB;
  v_result JSONB := '{"success": false, "errors": []}'::JSONB;
  v_total_bin_adjustment DECIMAL(10,2) := 0;
  v_record_found BOOLEAN := false;
BEGIN
  -- Get adjustment details
  SELECT * INTO v_adjustment
  FROM inventory_adjustments
  WHERE id = p_adjustment_id AND status = 'DRAFT';
  
  IF NOT FOUND THEN
    v_result := jsonb_set(v_result, '{errors}', '["Adjustment not found or already processed"]'::JSONB);
    RETURN v_result;
  END IF;
  
  -- Get user name - try from employees first, then from profiles
  -- Try to get name from employees table if adjusted_by exists
  IF v_adjustment.adjusted_by IS NOT NULL THEN
    SELECT full_name INTO v_user_name
    FROM employees
    WHERE id = v_adjustment.adjusted_by;
  END IF;
  
  -- If not found in employees, try to get from profiles via adjusted_by_user_id
  IF v_user_name IS NULL AND v_adjustment.adjusted_by_user_id IS NOT NULL THEN
    SELECT full_name INTO v_user_name
    FROM profiles
    WHERE user_id = v_adjustment.adjusted_by_user_id
    LIMIT 1;
  END IF;
  
  -- If still not found, try to get from auth.users metadata
  IF v_user_name IS NULL AND v_adjustment.adjusted_by_user_id IS NOT NULL THEN
    -- Use the user_id from adjustment record as fallback
    SELECT COALESCE(
      (SELECT raw_user_meta_data->>'name' FROM auth.users WHERE id = v_adjustment.adjusted_by_user_id),
      (SELECT email FROM auth.users WHERE id = v_adjustment.adjusted_by_user_id),
      'Unknown User'
    ) INTO v_user_name;
  END IF;
  
  IF v_user_name IS NULL THEN
    v_user_name := 'Unknown User';
  END IF;
  
  -- Process each item
  FOR v_item IN 
    SELECT * FROM inventory_adjustment_items 
    WHERE adjustment_id = p_adjustment_id
  LOOP
    -- Check if this item has bin-level adjustments
    SELECT COUNT(*) INTO v_total_bin_adjustment
    FROM inventory_adjustment_bins
    WHERE adjustment_item_id = v_item.id;
    
    IF v_total_bin_adjustment > 0 THEN
      -- Process bin-level adjustments
      v_total_bin_adjustment := 0;
      
      FOR v_bin_adjustment IN
        SELECT * FROM inventory_adjustment_bins
        WHERE adjustment_item_id = v_item.id
      LOOP
        -- Get current bin quantity - sum all quantities for this product in this bin
        SELECT COALESCE(SUM(quantity), 0) INTO v_bin_current_qty
        FROM warehouse_inventory
        WHERE bin_id = v_bin_adjustment.bin_id
          AND item_id = v_item.product_id
          AND item_type = 'PRODUCT';
        
        -- Validate bin quantity matches
        IF v_bin_current_qty != v_bin_adjustment.quantity_before THEN
          v_result := jsonb_set(
            v_result, 
            '{errors}', 
            jsonb_insert(
              COALESCE(v_result->'errors', '[]'::JSONB), 
              '-1', 
              to_jsonb(format('Bin quantity mismatch for SKU %s: expected %s, found %s', 
                v_item.sku, v_bin_adjustment.quantity_before, v_bin_current_qty))
            )
          );
          CONTINUE;
        END IF;
        
        -- Calculate new bin quantity
        IF v_adjustment.adjustment_type = 'ADD' THEN
          v_bin_new_qty := v_bin_current_qty + v_bin_adjustment.adjustment_quantity;
        ELSIF v_adjustment.adjustment_type = 'REMOVE' THEN
          IF v_bin_current_qty < v_bin_adjustment.adjustment_quantity THEN
            v_result := jsonb_set(
              v_result, 
              '{errors}', 
              jsonb_insert(
                COALESCE(v_result->'errors', '[]'::JSONB), 
                '-1', 
                to_jsonb(format('Insufficient bin quantity for SKU %s: have %s, need %s', 
                  v_item.sku, v_bin_current_qty, v_bin_adjustment.adjustment_quantity))
              )
            );
            CONTINUE;
          END IF;
          v_bin_new_qty := v_bin_current_qty - v_bin_adjustment.adjustment_quantity;
        ELSIF v_adjustment.adjustment_type = 'REPLACE' THEN
          v_bin_new_qty := v_bin_adjustment.quantity_after;
        END IF;
        
        -- Update warehouse_inventory for this bin
        -- Find the most recent warehouse_inventory record for this bin and product
        SELECT * INTO v_inventory_record
        FROM warehouse_inventory
        WHERE bin_id = v_bin_adjustment.bin_id
          AND item_id = v_item.product_id
          AND item_type = 'PRODUCT'
        ORDER BY created_at DESC
        LIMIT 1;
        
        v_record_found := FOUND;
        
        IF v_record_found THEN
          -- Update existing record
          UPDATE warehouse_inventory
          SET quantity = v_bin_new_qty,
              updated_at = NOW()
          WHERE id = v_inventory_record.id;
        ELSE
          -- If no record exists and it's an ADD operation, create new record
          IF v_adjustment.adjustment_type = 'ADD' THEN
            INSERT INTO warehouse_inventory (
              item_type,
              item_id,
              item_name,
              item_code,
              bin_id,
              quantity,
              unit,
              status
            ) VALUES (
              'PRODUCT',
              v_item.product_id,
              v_item.product_name,
              v_item.sku,
              v_bin_adjustment.bin_id,
              v_bin_adjustment.adjustment_quantity,
              COALESCE(v_item.unit, 'pcs'),
              'IN_STORAGE'
            );
          END IF;
        END IF;
        
        -- Update bin adjustment record with actual quantities
        UPDATE inventory_adjustment_bins
        SET quantity_after = v_bin_new_qty
        WHERE id = v_bin_adjustment.id;
        
        -- Track total bin adjustment for product_master update
        IF v_adjustment.adjustment_type = 'ADD' THEN
          v_total_bin_adjustment := v_total_bin_adjustment + v_bin_adjustment.adjustment_quantity;
        ELSIF v_adjustment.adjustment_type = 'REMOVE' THEN
          v_total_bin_adjustment := v_total_bin_adjustment - v_bin_adjustment.adjustment_quantity;
        ELSIF v_adjustment.adjustment_type = 'REPLACE' THEN
          v_total_bin_adjustment := v_total_bin_adjustment + (v_bin_adjustment.quantity_after - v_bin_adjustment.quantity_before);
        END IF;
      END LOOP;
      
      -- Update product_master based on bin adjustments
      IF v_total_bin_adjustment != 0 THEN
        SELECT COALESCE(current_stock, 0) INTO v_current_stock
        FROM product_master
        WHERE id = v_item.product_id;
        
        v_new_stock := v_current_stock + v_total_bin_adjustment;
        
        UPDATE product_master
        SET current_stock = v_new_stock,
            updated_at = NOW()
        WHERE id = v_item.product_id;
        
        -- Update adjustment item with actual quantities
        UPDATE inventory_adjustment_items
        SET quantity_before = v_current_stock,
            adjustment_quantity = ABS(v_total_bin_adjustment),
            quantity_after = v_new_stock
        WHERE id = v_item.id;
      END IF;
    ELSE
      -- No bin adjustments - use product-level adjustment (original logic)
      -- Get current stock
      SELECT COALESCE(current_stock, 0) INTO v_current_stock
      FROM product_master
      WHERE id = v_item.product_id;
      
      -- Validate current stock matches
      IF v_current_stock != v_item.quantity_before THEN
        v_result := jsonb_set(
          v_result, 
          '{errors}', 
          jsonb_insert(
            COALESCE(v_result->'errors', '[]'::JSONB), 
            '-1', 
            to_jsonb(format('Stock mismatch for SKU %s: expected %s, found %s', 
              v_item.sku, v_item.quantity_before, v_current_stock))
          )
        );
        CONTINUE;
      END IF;
      
      -- Calculate new stock based on adjustment type
      IF v_adjustment.adjustment_type = 'ADD' THEN
        v_new_stock := v_current_stock + v_item.adjustment_quantity;
      ELSIF v_adjustment.adjustment_type = 'REMOVE' THEN
        IF v_current_stock < v_item.adjustment_quantity THEN
          v_result := jsonb_set(
            v_result, 
            '{errors}', 
            jsonb_insert(
              COALESCE(v_result->'errors', '[]'::JSONB), 
              '-1', 
              to_jsonb(format('Insufficient stock for SKU %s: have %s, need %s', 
                v_item.sku, v_current_stock, v_item.adjustment_quantity))
            )
          );
          CONTINUE;
        END IF;
        v_new_stock := v_current_stock - v_item.adjustment_quantity;
      ELSIF v_adjustment.adjustment_type = 'REPLACE' THEN
        -- For REPLACE, use replace_quantity if available, otherwise use quantity_after
        v_new_stock := COALESCE(v_item.replace_quantity, v_item.quantity_after);
      END IF;
      
      -- Update product stock
      UPDATE product_master
      SET current_stock = v_new_stock,
          updated_at = NOW()
      WHERE id = v_item.product_id;
      
      -- Update adjustment item with actual quantities
      UPDATE inventory_adjustment_items
      SET quantity_after = v_new_stock
      WHERE id = v_item.id;
    END IF;
    
    -- Get product details for logging
    SELECT to_jsonb(pm.*) INTO v_product_details
    FROM product_master pm
    WHERE pm.id = v_item.product_id;
    
    -- Create log entry
    -- Use adjusted_by from adjustment record (may be null), and adjusted_by_user_id
    INSERT INTO inventory_adjustment_logs (
      adjustment_id,
      adjusted_by,
      adjusted_by_user_id,
      adjusted_by_name,
      product_id,
      sku,
      product_name,
      product_details,
      adjustment_type,
      reason_id,
      reason_name,
      quantity_before,
      adjustment_quantity,
      quantity_after,
      notes
    ) VALUES (
      p_adjustment_id,
      v_adjustment.adjusted_by, -- Employee ID (may be null)
      v_adjustment.adjusted_by_user_id, -- Auth user ID (always present)
      v_user_name,
      v_item.product_id,
      v_item.sku,
      v_item.product_name,
      v_product_details,
      v_adjustment.adjustment_type,
      v_adjustment.reason_id,
      (SELECT reason_name FROM inventory_adjustment_reasons WHERE id = v_adjustment.reason_id),
      v_item.quantity_before,
      v_item.adjustment_quantity,
      COALESCE(v_new_stock, v_item.quantity_after),
      v_adjustment.notes
    );
  END LOOP;
  
  -- If no errors, mark adjustment as completed
  IF jsonb_array_length(COALESCE(v_result->'errors', '[]'::JSONB)) = 0 THEN
    UPDATE inventory_adjustments
    SET status = 'COMPLETED'
    WHERE id = p_adjustment_id;
    
    v_result := jsonb_set(v_result, '{success}', 'true'::JSONB);
  END IF;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Verify the changes
-- Run these queries to verify the schema was updated correctly

-- Check inventory_adjustments columns
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'inventory_adjustments'
  AND column_name IN ('adjusted_by', 'adjusted_by_user_id')
ORDER BY column_name;

-- Check inventory_adjustment_logs columns
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'inventory_adjustment_logs'
  AND column_name IN ('adjusted_by', 'adjusted_by_user_id')
ORDER BY column_name;

-- Check function exists
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'execute_inventory_adjustment';

-- Success message
SELECT 'Schema fix completed successfully! All columns and functions have been updated.' as status;

