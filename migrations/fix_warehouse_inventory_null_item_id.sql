-- Fix warehouse_inventory table to allow null item_id values
-- This script fixes the constraint error when GRN items don't have corresponding master table entries

-- 1. Check if warehouse_inventory table exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'warehouse_inventory') THEN
        RAISE NOTICE 'warehouse_inventory table does not exist. Please run setup_warehouse_inventory_complete.sql first.';
        RETURN;
    END IF;
END $$;

-- 2. Make item_id column nullable (if it's not already)
ALTER TABLE warehouse_inventory 
ALTER COLUMN item_id DROP NOT NULL;

-- 3. Add a comment explaining why item_id can be null
COMMENT ON COLUMN warehouse_inventory.item_id IS 'Reference to fabric_master or item_master table. Can be null for custom items or items not in master tables.';

-- 4. Create an index on item_id for better performance (only on non-null values)
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_item_id ON warehouse_inventory(item_id) WHERE item_id IS NOT NULL;

-- 5. Update the view to handle null item_id values properly
DROP VIEW IF EXISTS receiving_zone_items;

CREATE OR REPLACE VIEW receiving_zone_items AS
SELECT 
  wi.id,
  wi.grn_id,
  wi.grn_item_id,
  wi.item_type,
  wi.item_name,
  wi.item_code,
  wi.quantity,
  wi.unit,
  wi.status,
  wi.received_date,
  wi.notes,
  b.bin_code,
  b.bin_name,
  r.rack_code,
  r.rack_name,
  f.floor_number,
  f.floor_name,
  w.name as warehouse_name,
  gm.grn_number,
  gm.status as grn_status,
  -- Add fabric/item details if item_id exists
  CASE 
    WHEN wi.item_id IS NOT NULL AND wi.item_type = 'FABRIC' THEN
      (SELECT fm.fabric_name || COALESCE(' - ' || fm.fabric_color, '') || COALESCE(' - ' || fm.fabric_gsm || ' GSM', '')
       FROM fabric_master fm WHERE fm.id = wi.item_id)
    WHEN wi.item_id IS NOT NULL AND wi.item_type = 'ITEM' THEN
      (SELECT im.item_name FROM item_master im WHERE im.id = wi.item_id)
    WHEN wi.item_id IS NOT NULL AND wi.item_type = 'PRODUCT' THEN
      (SELECT pm.product_name FROM product_master pm WHERE pm.id = wi.item_id)
    ELSE wi.item_name -- Use the item_name from warehouse_inventory for custom items
  END as detailed_item_name
FROM warehouse_inventory wi
JOIN bins b ON wi.bin_id = b.id
JOIN racks r ON b.rack_id = r.id
JOIN floors f ON r.floor_id = f.id
JOIN warehouses w ON f.warehouse_id = w.id
LEFT JOIN grn_master gm ON wi.grn_id = gm.id
WHERE b.location_type = 'RECEIVING_ZONE'
  AND wi.status = 'RECEIVED'
ORDER BY wi.received_date DESC;

-- 6. Create RLS policy for the updated view
DROP POLICY IF EXISTS "Authenticated users can view receiving zone items" ON receiving_zone_items;

CREATE POLICY "Authenticated users can view receiving zone items"
  ON receiving_zone_items
  FOR SELECT
  TO authenticated
  USING (true);

-- 7. Add a function to safely insert warehouse inventory items
CREATE OR REPLACE FUNCTION insert_warehouse_inventory_safe(
  p_grn_id UUID,
  p_grn_item_id UUID,
  p_item_type warehouse_item_type,
  p_item_id UUID,
  p_item_name TEXT,
  p_item_code TEXT,
  p_quantity DECIMAL(10,3),
  p_unit TEXT,
  p_bin_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_inventory_id UUID;
BEGIN
  -- Insert the warehouse inventory item with proper null handling
  INSERT INTO warehouse_inventory (
    grn_id,
    grn_item_id,
    item_type,
    item_id, -- Can be null
    item_name,
    item_code,
    quantity,
    unit,
    bin_id,
    status,
    notes
  ) VALUES (
    p_grn_id,
    p_grn_item_id,
    p_item_type,
    p_item_id, -- Will be null if not provided
    p_item_name,
    p_item_code,
    p_quantity,
    p_unit,
    p_bin_id,
    'RECEIVED',
    p_notes
  ) RETURNING id INTO v_inventory_id;
  
  RETURN v_inventory_id;
END;
$$ LANGUAGE plpgsql;

-- 8. Add a comment explaining the function
COMMENT ON FUNCTION insert_warehouse_inventory_safe IS 'Safely inserts warehouse inventory items, allowing null item_id for custom items';

-- 9. Create a trigger to automatically insert warehouse inventory when GRN is approved
CREATE OR REPLACE FUNCTION trigger_insert_warehouse_inventory_on_grn_approval()
RETURNS TRIGGER AS $$
DECLARE
  grn_item RECORD;
  receiving_bin_id UUID;
BEGIN
  -- Only process when GRN status changes to approved or partially_approved
  IF (TG_OP = 'UPDATE' AND OLD.status != NEW.status AND 
      (NEW.status = 'approved' OR NEW.status = 'partially_approved')) THEN
    
    -- Get a receiving zone bin
    SELECT id INTO receiving_bin_id
    FROM bins 
    WHERE location_type = 'RECEIVING_ZONE' 
      AND is_active = true
    LIMIT 1;
    
    -- If no receiving bin exists, create a default one
    IF receiving_bin_id IS NULL THEN
      -- Get the first available rack
      INSERT INTO bins (bin_code, bin_name, location_type, rack_id, is_active)
      SELECT 'B001', 'Default Receiving Bin', 'RECEIVING_ZONE', r.id, true
      FROM racks r
      JOIN floors f ON r.floor_id = f.id
      JOIN warehouses w ON f.warehouse_id = w.id
      LIMIT 1
      RETURNING id INTO receiving_bin_id;
    END IF;
    
    -- Insert warehouse inventory for approved items
    FOR grn_item IN 
      SELECT gi.*, gm.grn_number
      FROM grn_items gi
      JOIN grn_master gm ON gi.grn_id = gm.id
      WHERE gi.grn_id = NEW.id 
        AND gi.quality_status = 'approved'
        AND gi.approved_quantity > 0
    LOOP
      -- Check if this item is already in warehouse inventory
      IF NOT EXISTS (
        SELECT 1 FROM warehouse_inventory 
        WHERE grn_item_id = grn_item.id
      ) THEN
        -- Insert into warehouse inventory
        INSERT INTO warehouse_inventory (
          grn_id,
          grn_item_id,
          item_type,
          item_id, -- Can be null
          item_name,
          item_code,
          quantity,
          unit,
          bin_id,
          status,
          notes
        ) VALUES (
          NEW.id,
          grn_item.id,
          CASE grn_item.item_type
            WHEN 'fabric' THEN 'FABRIC'
            WHEN 'item' THEN 'ITEM'
            WHEN 'product' THEN 'PRODUCT'
            ELSE 'ITEM'
          END::warehouse_item_type,
          grn_item.item_id, -- Will be null if not in master tables
          grn_item.item_name,
          COALESCE(grn_item.item_code, grn_item.item_name),
          grn_item.approved_quantity,
          grn_item.unit_of_measure,
          receiving_bin_id,
          'RECEIVED',
          'Auto-inserted from approved GRN ' || NEW.grn_number
        );
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. Create the trigger
DROP TRIGGER IF EXISTS trigger_grn_approval_warehouse_inventory ON grn_master;

CREATE TRIGGER trigger_grn_approval_warehouse_inventory
  AFTER UPDATE ON grn_master
  FOR EACH ROW
  EXECUTE FUNCTION trigger_insert_warehouse_inventory_on_grn_approval();

-- 11. Add comments
COMMENT ON FUNCTION trigger_insert_warehouse_inventory_on_grn_approval IS 'Automatically inserts approved GRN items into warehouse inventory when GRN is approved';

-- Success message
SELECT 'Warehouse inventory null item_id constraint fixed successfully!' as status;
