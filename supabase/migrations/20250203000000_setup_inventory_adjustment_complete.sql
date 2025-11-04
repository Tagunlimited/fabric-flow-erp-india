-- Complete Inventory Adjustment System Setup
-- This migration combines all inventory adjustment tables and functions
-- Run this if the previous migrations haven't been applied

-- ============================================================================
-- PART 1: Base Tables
-- ============================================================================

-- 1. Create inventory_adjustment_reasons table
CREATE TABLE IF NOT EXISTS inventory_adjustment_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reason_name TEXT UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create inventory_adjustments table
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('ADD', 'REMOVE', 'REPLACE')),
  reason_id UUID REFERENCES inventory_adjustment_reasons(id),
  custom_reason TEXT,
  notes TEXT,
  adjusted_by UUID REFERENCES employees(id), -- Nullable to allow auth users without employee record
  adjusted_by_user_id UUID, -- Store auth user ID for reference
  adjustment_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Status tracking
  status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'COMPLETED', 'CANCELLED'))
);

-- 3. Create inventory_adjustment_items table
CREATE TABLE IF NOT EXISTS inventory_adjustment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID REFERENCES inventory_adjustments(id) ON DELETE CASCADE,
  product_id UUID REFERENCES product_master(id) NOT NULL,
  sku TEXT NOT NULL,
  
  -- Product details snapshot (for historical tracking)
  product_name TEXT NOT NULL,
  product_class TEXT,
  product_color TEXT,
  product_size TEXT,
  product_category TEXT,
  product_brand TEXT,
  
  -- Quantity tracking
  quantity_before DECIMAL(10,2) NOT NULL,
  adjustment_quantity DECIMAL(10,2) NOT NULL,
  quantity_after DECIMAL(10,2) NOT NULL,
  
  -- Replace-specific
  replace_quantity DECIMAL(10,2), -- For REPLACE type
  
  unit TEXT DEFAULT 'pcs',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create inventory_adjustment_bins table (bin-level adjustments)
CREATE TABLE IF NOT EXISTS inventory_adjustment_bins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_item_id UUID REFERENCES inventory_adjustment_items(id) ON DELETE CASCADE NOT NULL,
  bin_id UUID REFERENCES bins(id) NOT NULL,
  quantity_before DECIMAL(10,2) NOT NULL,
  adjustment_quantity DECIMAL(10,2) NOT NULL,
  quantity_after DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create inventory_adjustment_logs table (Audit Trail)
CREATE TABLE IF NOT EXISTS inventory_adjustment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID REFERENCES inventory_adjustments(id) ON DELETE CASCADE,
  
  -- User information
  adjusted_by UUID REFERENCES employees(id), -- Nullable to allow auth users without employee record
  adjusted_by_user_id UUID, -- Store auth user ID for reference
  adjusted_by_name TEXT NOT NULL,
  
  -- Product information
  product_id UUID REFERENCES product_master(id),
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_details JSONB, -- Full product snapshot
  
  -- Adjustment details
  adjustment_type TEXT NOT NULL,
  reason_id UUID REFERENCES inventory_adjustment_reasons(id),
  reason_name TEXT,
  
  -- Quantity changes
  quantity_before DECIMAL(10,2) NOT NULL,
  adjustment_quantity DECIMAL(10,2) NOT NULL,
  quantity_after DECIMAL(10,2) NOT NULL,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 2: Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_adjustment_reasons_active ON inventory_adjustment_reasons(is_active);
CREATE INDEX IF NOT EXISTS idx_adjustments_date ON inventory_adjustments(adjustment_date);
CREATE INDEX IF NOT EXISTS idx_adjustments_status ON inventory_adjustments(status);
CREATE INDEX IF NOT EXISTS idx_adjustments_type ON inventory_adjustments(adjustment_type);
CREATE INDEX IF NOT EXISTS idx_adjustment_items_sku ON inventory_adjustment_items(sku);
CREATE INDEX IF NOT EXISTS idx_adjustment_items_product ON inventory_adjustment_items(product_id);
CREATE INDEX IF NOT EXISTS idx_adjustment_items_adjustment ON inventory_adjustment_items(adjustment_id);
CREATE INDEX IF NOT EXISTS idx_adjustment_bins_item ON inventory_adjustment_bins(adjustment_item_id);
CREATE INDEX IF NOT EXISTS idx_adjustment_bins_bin ON inventory_adjustment_bins(bin_id);
CREATE INDEX IF NOT EXISTS idx_adjustment_logs_date ON inventory_adjustment_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_adjustment_logs_sku ON inventory_adjustment_logs(sku);
CREATE INDEX IF NOT EXISTS idx_adjustment_logs_adjustment ON inventory_adjustment_logs(adjustment_id);

-- ============================================================================
-- PART 3: Row Level Security (RLS)
-- ============================================================================

ALTER TABLE inventory_adjustment_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustment_bins ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustment_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Authenticated users can manage adjustment reasons" ON inventory_adjustment_reasons;
DROP POLICY IF EXISTS "Authenticated users can manage adjustments" ON inventory_adjustments;
DROP POLICY IF EXISTS "Authenticated users can manage adjustment items" ON inventory_adjustment_items;
DROP POLICY IF EXISTS "Authenticated users can manage adjustment bins" ON inventory_adjustment_bins;
DROP POLICY IF EXISTS "Authenticated users can view adjustment logs" ON inventory_adjustment_logs;

-- Create RLS Policies
CREATE POLICY "Authenticated users can manage adjustment reasons"
  ON inventory_adjustment_reasons FOR ALL
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage adjustments"
  ON inventory_adjustments FOR ALL
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage adjustment items"
  ON inventory_adjustment_items FOR ALL
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage adjustment bins"
  ON inventory_adjustment_bins FOR ALL
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can view adjustment logs"
  ON inventory_adjustment_logs FOR SELECT
  TO authenticated USING (true);

-- ============================================================================
-- PART 4: Triggers
-- ============================================================================

-- Create updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_adjustment_reasons_updated_at ON inventory_adjustment_reasons;
CREATE TRIGGER update_adjustment_reasons_updated_at 
    BEFORE UPDATE ON inventory_adjustment_reasons 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 5: Default Data
-- ============================================================================

-- Insert default adjustment reasons
INSERT INTO inventory_adjustment_reasons (reason_name, description, is_active)
VALUES 
  ('Sold on Amazon', 'Products sold through Amazon marketplace', true),
  ('Internally Used', 'Products used for internal purposes', true),
  ('Rejected', 'Products rejected due to quality issues', true),
  ('Damaged', 'Products damaged and removed from inventory', true),
  ('Returned', 'Products returned by customers', true),
  ('Stock Count Correction', 'Correction after physical stock count', true),
  ('Theft/Loss', 'Products lost or stolen', true),
  ('Expired', 'Products expired and removed', true)
ON CONFLICT (reason_name) DO NOTHING;

-- ============================================================================
-- PART 6: Execute Inventory Adjustment Function
-- ============================================================================

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

-- ============================================================================
-- PART 7: Comments
-- ============================================================================

COMMENT ON TABLE inventory_adjustment_reasons IS 'Predefined reasons for inventory adjustments';
COMMENT ON TABLE inventory_adjustments IS 'Main inventory adjustment records';
COMMENT ON TABLE inventory_adjustment_items IS 'Individual items within an adjustment';
COMMENT ON TABLE inventory_adjustment_bins IS 'Bin-level inventory adjustments linked to adjustment items';
COMMENT ON TABLE inventory_adjustment_logs IS 'Complete audit trail of all inventory adjustments';
COMMENT ON FUNCTION execute_inventory_adjustment IS 'Executes an inventory adjustment and updates product stock and warehouse inventory';

