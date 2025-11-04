-- Inventory Adjustment System
-- Creates tables for managing inventory adjustments with full audit logging

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
  adjusted_by UUID REFERENCES employees(id) NOT NULL,
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

-- 4. Create inventory_adjustment_logs table (Audit Trail)
CREATE TABLE IF NOT EXISTS inventory_adjustment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID REFERENCES inventory_adjustments(id) ON DELETE CASCADE,
  
  -- User information
  adjusted_by UUID REFERENCES employees(id) NOT NULL,
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

-- 5. Create indexes
CREATE INDEX IF NOT EXISTS idx_adjustment_reasons_active ON inventory_adjustment_reasons(is_active);
CREATE INDEX IF NOT EXISTS idx_adjustments_date ON inventory_adjustments(adjustment_date);
CREATE INDEX IF NOT EXISTS idx_adjustments_status ON inventory_adjustments(status);
CREATE INDEX IF NOT EXISTS idx_adjustments_type ON inventory_adjustments(adjustment_type);
CREATE INDEX IF NOT EXISTS idx_adjustment_items_sku ON inventory_adjustment_items(sku);
CREATE INDEX IF NOT EXISTS idx_adjustment_items_product ON inventory_adjustment_items(product_id);
CREATE INDEX IF NOT EXISTS idx_adjustment_items_adjustment ON inventory_adjustment_items(adjustment_id);
CREATE INDEX IF NOT EXISTS idx_adjustment_logs_date ON inventory_adjustment_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_adjustment_logs_sku ON inventory_adjustment_logs(sku);
CREATE INDEX IF NOT EXISTS idx_adjustment_logs_adjustment ON inventory_adjustment_logs(adjustment_id);

-- 6. Enable RLS
ALTER TABLE inventory_adjustment_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustment_logs ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS Policies
CREATE POLICY "Authenticated users can manage adjustment reasons"
  ON inventory_adjustment_reasons FOR ALL
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage adjustments"
  ON inventory_adjustments FOR ALL
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage adjustment items"
  ON inventory_adjustment_items FOR ALL
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can view adjustment logs"
  ON inventory_adjustment_logs FOR SELECT
  TO authenticated USING (true);

-- 8. Create updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 9. Create trigger for updated_at
DROP TRIGGER IF EXISTS update_adjustment_reasons_updated_at ON inventory_adjustment_reasons;
CREATE TRIGGER update_adjustment_reasons_updated_at 
    BEFORE UPDATE ON inventory_adjustment_reasons 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 10. Insert default adjustment reasons
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

-- 11. Create function to execute inventory adjustment
CREATE OR REPLACE FUNCTION execute_inventory_adjustment(
  p_adjustment_id UUID,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_adjustment RECORD;
  v_item RECORD;
  v_current_stock DECIMAL(10,2);
  v_new_stock DECIMAL(10,2);
  v_user_name TEXT;
  v_product_details JSONB;
  v_result JSONB := '{"success": false, "errors": []}'::JSONB;
BEGIN
  -- Get adjustment details
  SELECT * INTO v_adjustment
  FROM inventory_adjustments
  WHERE id = p_adjustment_id AND status = 'DRAFT';
  
  IF NOT FOUND THEN
    v_result := jsonb_set(v_result, '{errors}', '["Adjustment not found or already processed"]'::JSONB);
    RETURN v_result;
  END IF;
  
  -- Get user name
  SELECT full_name INTO v_user_name
  FROM employees
  WHERE id = p_user_id;
  
  IF v_user_name IS NULL THEN
    v_user_name := 'Unknown User';
  END IF;
  
  -- Process each item
  FOR v_item IN 
    SELECT * FROM inventory_adjustment_items 
    WHERE adjustment_id = p_adjustment_id
  LOOP
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
    
    -- Get product details for logging
    SELECT to_jsonb(pm.*) INTO v_product_details
    FROM product_master pm
    WHERE pm.id = v_item.product_id;
    
    -- Create log entry
    INSERT INTO inventory_adjustment_logs (
      adjustment_id,
      adjusted_by,
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
      p_user_id,
      v_user_name,
      v_item.product_id,
      v_item.sku,
      v_item.product_name,
      v_product_details,
      v_adjustment.adjustment_type,
      v_adjustment.reason_id,
      (SELECT reason_name FROM inventory_adjustment_reasons WHERE id = v_adjustment.reason_id),
      v_current_stock,
      v_item.adjustment_quantity,
      v_new_stock,
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

-- 12. Add comments
COMMENT ON TABLE inventory_adjustment_reasons IS 'Predefined reasons for inventory adjustments';
COMMENT ON TABLE inventory_adjustments IS 'Main inventory adjustment records';
COMMENT ON TABLE inventory_adjustment_items IS 'Individual items within an adjustment';
COMMENT ON TABLE inventory_adjustment_logs IS 'Complete audit trail of all inventory adjustments';

