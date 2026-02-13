-- Fix inventory adjustment to properly sync warehouse_inventory records
-- This ensures that when inventory adjustments are made, warehouse_inventory records
-- are created or updated for all adjustment types (ADD, REMOVE, REPLACE)

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
  v_default_bin_id UUID;
  v_bin_code TEXT;
  v_bin_proportion DECIMAL(10,4);
  v_bin_adjustment_qty DECIMAL(10,2);
  v_total_bin_qty DECIMAL(10,2);
  v_bin_count INTEGER;
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
  IF v_adjustment.adjusted_by IS NOT NULL THEN
    SELECT full_name INTO v_user_name
    FROM employees
    WHERE id = v_adjustment.adjusted_by;
  END IF;
  
  IF v_user_name IS NULL AND v_adjustment.adjusted_by_user_id IS NOT NULL THEN
    SELECT full_name INTO v_user_name
    FROM profiles
    WHERE user_id = v_adjustment.adjusted_by_user_id
    LIMIT 1;
  END IF;
  
  IF v_user_name IS NULL AND v_adjustment.adjusted_by_user_id IS NOT NULL THEN
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
        
        -- Validate bin quantity matches (only if not zero)
        IF v_bin_current_qty > 0 AND v_bin_current_qty != v_bin_adjustment.quantity_before THEN
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
              updated_at = NOW(),
              status = CASE 
                WHEN v_bin_new_qty > 0 THEN COALESCE(status, 'IN_STORAGE')
                ELSE status
              END
          WHERE id = v_inventory_record.id;
        ELSE
        -- If no record exists, create new record for all adjustment types
        -- Only create if the new quantity is greater than 0
        IF v_bin_new_qty > 0 THEN
          INSERT INTO warehouse_inventory (
            item_type,
            item_id,
            item_name,
            item_code,
            bin_id,
            quantity,
            unit,
            status,
            moved_to_storage_date
          ) VALUES (
            'PRODUCT',
            v_item.product_id,
            v_item.product_name,
            v_item.sku,
            v_bin_adjustment.bin_id,
            v_bin_new_qty,
            COALESCE(v_item.unit, 'pcs'),
            'IN_STORAGE',
            CASE WHEN v_adjustment.adjustment_type = 'ADD' THEN NOW() ELSE NULL END
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
      -- No bin adjustments - use product-level adjustment
      -- Get current stock
      SELECT COALESCE(current_stock, 0) INTO v_current_stock
      FROM product_master
      WHERE id = v_item.product_id;
      
      -- Validate current stock matches (allow some tolerance for concurrent updates)
      IF ABS(v_current_stock - v_item.quantity_before) > 0.01 THEN
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
        v_new_stock := COALESCE(v_item.replace_quantity, v_item.quantity_after);
      END IF;
      
      -- Update product stock
      UPDATE product_master
      SET current_stock = v_new_stock,
          updated_at = NOW()
      WHERE id = v_item.product_id;
      
      -- When no bins are selected, sync to warehouse_inventory
      -- Find all existing warehouse_inventory records for this product in storage bins
      v_record_found := false;
      FOR v_inventory_record IN
        SELECT wi.*, b.location_type
        FROM warehouse_inventory wi
        JOIN bins b ON wi.bin_id = b.id
        WHERE wi.item_id = v_item.product_id
          AND wi.item_type = 'PRODUCT'
          AND b.location_type = 'STORAGE'
          AND wi.status = 'IN_STORAGE'
      LOOP
        v_record_found := true;
        
        -- Calculate proportional adjustment based on current bin quantities
        -- Get total quantity across all bins for this product
        SELECT COALESCE(SUM(wi2.quantity), 0) INTO v_total_bin_qty
        FROM warehouse_inventory wi2
        JOIN bins b2 ON wi2.bin_id = b2.id
        WHERE wi2.item_id = v_item.product_id
          AND wi2.item_type = 'PRODUCT'
          AND b2.location_type = 'STORAGE'
          AND wi2.status = 'IN_STORAGE';
        
        -- Calculate proportion based on current quantity in warehouse
        IF v_total_bin_qty > 0 THEN
          v_bin_proportion := v_inventory_record.quantity / v_total_bin_qty;
        ELSE
          -- If no current stock in warehouse, use equal distribution
          SELECT COUNT(*) INTO v_bin_count
          FROM warehouse_inventory wi3
          JOIN bins b3 ON wi3.bin_id = b3.id
          WHERE wi3.item_id = v_item.product_id
            AND wi3.item_type = 'PRODUCT'
            AND b3.location_type = 'STORAGE'
            AND wi3.status = 'IN_STORAGE';
          v_bin_proportion := CASE WHEN v_bin_count > 0 THEN 1.0 / v_bin_count ELSE 1.0 END;
        END IF;
        
        -- Calculate adjustment for this bin
        IF v_adjustment.adjustment_type = 'ADD' THEN
          v_bin_adjustment_qty := v_item.adjustment_quantity * v_bin_proportion;
          v_bin_new_qty := v_inventory_record.quantity + v_bin_adjustment_qty;
        ELSIF v_adjustment.adjustment_type = 'REMOVE' THEN
          v_bin_adjustment_qty := v_item.adjustment_quantity * v_bin_proportion;
          v_bin_new_qty := GREATEST(0, v_inventory_record.quantity - v_bin_adjustment_qty);
        ELSIF v_adjustment.adjustment_type = 'REPLACE' THEN
          v_bin_new_qty := v_new_stock * v_bin_proportion;
        END IF;
        
        -- Update the warehouse_inventory record
        UPDATE warehouse_inventory
        SET quantity = v_bin_new_qty,
            updated_at = NOW()
        WHERE id = v_inventory_record.id;
      END LOOP;
      
      -- If no warehouse_inventory records exist, create one in a default storage bin
      IF NOT v_record_found THEN
        -- Find a default storage bin
        SELECT b.id, b.bin_code INTO v_default_bin_id, v_bin_code
        FROM bins b
        WHERE b.location_type = 'STORAGE'
          AND b.is_active = true
        ORDER BY b.created_at ASC
        LIMIT 1;
        
        IF v_default_bin_id IS NOT NULL THEN
          INSERT INTO warehouse_inventory (
            item_type,
            item_id,
            item_name,
            item_code,
            bin_id,
            quantity,
            unit,
            status,
            moved_to_storage_date
          ) VALUES (
            'PRODUCT',
            v_item.product_id,
            v_item.product_name,
            v_item.sku,
            v_default_bin_id,
            v_new_stock,
            COALESCE(v_item.unit, 'pcs'),
            'IN_STORAGE',
            NOW()
          );
        END IF;
      END IF;
      
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
      v_adjustment.adjusted_by,
      v_adjustment.adjusted_by_user_id,
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
  
  -- Mark adjustment as completed
  UPDATE inventory_adjustments
  SET status = 'COMPLETED',
      updated_at = NOW()
  WHERE id = p_adjustment_id;
  
  -- Return success
  v_result := '{"success": true}'::JSONB;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION execute_inventory_adjustment IS 'Executes an inventory adjustment and updates product stock and warehouse inventory. Creates warehouse_inventory records when they do not exist.';

