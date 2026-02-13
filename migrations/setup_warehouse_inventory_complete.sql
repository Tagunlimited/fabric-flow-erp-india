-- Complete Warehouse Inventory Setup
-- This script sets up the complete warehouse inventory system for GRN integration

-- 1. Create warehouse structure tables if they don't exist
-- Create floors table
CREATE TABLE IF NOT EXISTS floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_number INTEGER NOT NULL,
  floor_name TEXT NOT NULL,
  description TEXT,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create racks table
CREATE TABLE IF NOT EXISTS racks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rack_code TEXT NOT NULL,
  rack_name TEXT NOT NULL,
  description TEXT,
  floor_id UUID REFERENCES floors(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create bins table
CREATE TABLE IF NOT EXISTS bins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bin_code TEXT NOT NULL,
  bin_name TEXT NOT NULL,
  location_type TEXT NOT NULL CHECK (location_type IN ('RECEIVING_ZONE', 'STORAGE', 'DISPATCH_ZONE', 'QUARANTINE')),
  rack_id UUID REFERENCES racks(id) ON DELETE CASCADE,
  capacity DECIMAL(10,3),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create warehouse inventory tables
-- Create enum types
DO $$ BEGIN
  CREATE TYPE inventory_status AS ENUM (
    'RECEIVED',      -- Item received in GRN, placed in receiving zone
    'IN_STORAGE',    -- Item moved to storage zone
    'READY_TO_DISPATCH', -- Item in dispatch zone
    'DISPATCHED',    -- Item has been dispatched
    'QUARANTINED'    -- Item quarantined for quality issues
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE warehouse_item_type AS ENUM (
    'FABRIC',
    'ITEM',
    'PRODUCT'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create warehouse_inventory table
CREATE TABLE IF NOT EXISTS warehouse_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id UUID REFERENCES grn_master(id) ON DELETE CASCADE,
  grn_item_id UUID REFERENCES grn_items(id) ON DELETE CASCADE,
  item_type warehouse_item_type NOT NULL,
  item_id UUID, -- Reference to fabric_master or item_master (nullable for custom items)
  item_name TEXT NOT NULL,
  item_code TEXT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL,
  unit TEXT NOT NULL,
  bin_id UUID NOT NULL REFERENCES bins(id) ON DELETE CASCADE,
  status inventory_status NOT NULL DEFAULT 'RECEIVED',
  received_date TIMESTAMPTZ DEFAULT NOW(),
  moved_to_storage_date TIMESTAMPTZ,
  dispatched_date TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create inventory_movements table
CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES warehouse_inventory(id) ON DELETE CASCADE,
  from_bin_id UUID REFERENCES bins(id),
  to_bin_id UUID NOT NULL REFERENCES bins(id),
  quantity DECIMAL(10,3) NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('TRANSFER', 'DISPATCH', 'QUARANTINE')),
  reason TEXT,
  moved_by UUID,
  moved_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- 3. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_grn_id ON warehouse_inventory(grn_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_bin_id ON warehouse_inventory(bin_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_status ON warehouse_inventory(status);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_item_type ON warehouse_inventory(item_type);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_inventory_id ON inventory_movements(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_from_bin ON inventory_movements(from_bin_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_to_bin ON inventory_movements(to_bin_id);

-- 4. Enable RLS
ALTER TABLE warehouse_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE racks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bins ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS policies
DROP POLICY IF EXISTS "Authenticated users can view warehouse inventory" ON warehouse_inventory;
DROP POLICY IF EXISTS "Authenticated users can manage warehouse inventory" ON warehouse_inventory;
DROP POLICY IF EXISTS "Authenticated users can view inventory movements" ON inventory_movements;
DROP POLICY IF EXISTS "Authenticated users can manage inventory movements" ON inventory_movements;

CREATE POLICY "Authenticated users can view warehouse inventory"
  ON warehouse_inventory
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage warehouse inventory"
  ON warehouse_inventory
  FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view inventory movements"
  ON inventory_movements
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage inventory movements"
  ON inventory_movements
  FOR ALL
  TO authenticated
  USING (true);

-- Create policies for warehouse structure tables
CREATE POLICY "Authenticated users can view warehouse structure"
  ON floors
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage warehouse structure"
  ON floors
  FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view racks"
  ON racks
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage racks"
  ON racks
  FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view bins"
  ON bins
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage bins"
  ON bins
  FOR ALL
  TO authenticated
  USING (true);

-- 6. Create triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_warehouse_inventory_updated_at ON warehouse_inventory;
DROP TRIGGER IF EXISTS update_floors_updated_at ON floors;
DROP TRIGGER IF EXISTS update_racks_updated_at ON racks;
DROP TRIGGER IF EXISTS update_bins_updated_at ON bins;

CREATE TRIGGER update_warehouse_inventory_updated_at
  BEFORE UPDATE ON warehouse_inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_floors_updated_at
  BEFORE UPDATE ON floors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_racks_updated_at
  BEFORE UPDATE ON racks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bins_updated_at
  BEFORE UPDATE ON bins
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 7. Insert default warehouse structure if none exists
DO $$
BEGIN
  -- Check if we have any warehouses
  IF NOT EXISTS (SELECT 1 FROM warehouses LIMIT 1) THEN
    -- Insert default warehouse
    INSERT INTO warehouses (name, code, address, city, pincode, status)
    VALUES ('Main Warehouse', 'WH001', '123 Industrial Area', 'Mumbai', '400001', 'active');
  END IF;

  -- Check if we have any floors
  IF NOT EXISTS (SELECT 1 FROM floors LIMIT 1) THEN
    -- Insert default floor for the first warehouse
    INSERT INTO floors (floor_number, floor_name, description, warehouse_id)
    SELECT 1, 'Ground Floor', 'Main receiving and dispatch area', id
    FROM warehouses LIMIT 1;
  END IF;

  -- Check if we have any racks
  IF NOT EXISTS (SELECT 1 FROM racks LIMIT 1) THEN
    -- Insert default racks for the first floor
    INSERT INTO racks (rack_code, rack_name, description, floor_id)
    SELECT 'R001', 'Receiving Rack', 'Receiving area rack', id
    FROM floors LIMIT 1;
    
    INSERT INTO racks (rack_code, rack_name, description, floor_id)
    SELECT 'R002', 'Storage Rack', 'Storage area rack', id
    FROM floors LIMIT 1;
    
    INSERT INTO racks (rack_code, rack_name, description, floor_id)
    SELECT 'R003', 'Dispatch Rack', 'Dispatch area rack', id
    FROM floors LIMIT 1;
  END IF;

  -- Check if we have any bins
  IF NOT EXISTS (SELECT 1 FROM bins LIMIT 1) THEN
    -- Insert default bins for receiving zone
    INSERT INTO bins (bin_code, bin_name, location_type, rack_id)
    SELECT 'B001', 'Receiving Bin 1', 'RECEIVING_ZONE', id
    FROM racks WHERE rack_code = 'R001' LIMIT 1;
    
    INSERT INTO bins (bin_code, bin_name, location_type, rack_id)
    SELECT 'B002', 'Receiving Bin 2', 'RECEIVING_ZONE', id
    FROM racks WHERE rack_code = 'R001' LIMIT 1;
    
    -- Insert default bins for storage zone
    INSERT INTO bins (bin_code, bin_name, location_type, rack_id)
    SELECT 'B003', 'Storage Bin 1', 'STORAGE', id
    FROM racks WHERE rack_code = 'R002' LIMIT 1;
    
    INSERT INTO bins (bin_code, bin_name, location_type, rack_id)
    SELECT 'B004', 'Storage Bin 2', 'STORAGE', id
    FROM racks WHERE rack_code = 'R002' LIMIT 1;
    
    -- Insert default bins for dispatch zone
    INSERT INTO bins (bin_code, bin_name, location_type, rack_id)
    SELECT 'B005', 'Dispatch Bin 1', 'DISPATCH_ZONE', id
    FROM racks WHERE rack_code = 'R003' LIMIT 1;
  END IF;
END $$;

-- 8. Add comments for documentation
COMMENT ON TABLE warehouse_inventory IS 'Tracks GRN items placed in warehouse bins';
COMMENT ON TABLE inventory_movements IS 'Tracks all movements of inventory between bins';
COMMENT ON TABLE floors IS 'Warehouse floor structure';
COMMENT ON TABLE racks IS 'Warehouse rack structure';
COMMENT ON TABLE bins IS 'Warehouse bin locations';

COMMENT ON COLUMN warehouse_inventory.grn_item_id IS 'Reference to the specific item in GRN';
COMMENT ON COLUMN warehouse_inventory.item_type IS 'Type of item: FABRIC, ITEM, or PRODUCT';
COMMENT ON COLUMN warehouse_inventory.item_id IS 'Reference to fabric_master or item_master table (nullable)';
COMMENT ON COLUMN warehouse_inventory.bin_id IS 'Current bin location of the item';
COMMENT ON COLUMN warehouse_inventory.status IS 'Current status of the inventory item';

-- 9. Create a view for easy querying of receiving zone items
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
  gm.status as grn_status
FROM warehouse_inventory wi
JOIN bins b ON wi.bin_id = b.id
JOIN racks r ON b.rack_id = r.id
JOIN floors f ON r.floor_id = f.id
JOIN warehouses w ON f.warehouse_id = w.id
LEFT JOIN grn_master gm ON wi.grn_id = gm.id
WHERE b.location_type = 'RECEIVING_ZONE'
  AND wi.status = 'RECEIVED'
ORDER BY wi.received_date DESC;

-- 10. Create RLS policy for the view
CREATE POLICY "Authenticated users can view receiving zone items"
  ON receiving_zone_items
  FOR SELECT
  TO authenticated
  USING (true);

-- Success message
SELECT 'Warehouse inventory system setup completed successfully!' as status;
