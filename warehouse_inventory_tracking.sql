-- Warehouse Inventory Tracking System
-- Tracks GRN items in warehouse bins and their movements

-- Create enum for inventory status
CREATE TYPE inventory_status AS ENUM (
  'RECEIVED',      -- Item received in GRN, placed in receiving zone
  'IN_STORAGE',    -- Item moved to storage zone
  'READY_TO_DISPATCH', -- Item in dispatch zone
  'DISPATCHED',    -- Item has been dispatched
  'QUARANTINED'    -- Item quarantined for quality issues
);

-- Create enum for item types
CREATE TYPE warehouse_item_type AS ENUM (
  'FABRIC',
  'ITEM',
  'PRODUCT'
);

-- Warehouse inventory table - tracks items in bins
CREATE TABLE warehouse_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id UUID NOT NULL REFERENCES goods_receipt_notes(id) ON DELETE CASCADE,
  grn_item_id UUID NOT NULL REFERENCES grn_items(id) ON DELETE CASCADE, -- Reference to grn_items table
  item_type warehouse_item_type NOT NULL,
  item_id UUID NOT NULL, -- Reference to fabric_master or item_master
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
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Allow same GRN item to be split across multiple bins
  -- UNIQUE(grn_item_id, bin_id) -- Removed to allow item splitting
);

-- Inventory movements table - tracks all movements between bins
CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES warehouse_inventory(id) ON DELETE CASCADE,
  from_bin_id UUID REFERENCES bins(id),
  to_bin_id UUID NOT NULL REFERENCES bins(id),
  quantity DECIMAL(10,3) NOT NULL,
  movement_type TEXT NOT NULL, -- 'TRANSFER', 'DISPATCH', 'QUARANTINE'
  reason TEXT,
  moved_by UUID, -- User who performed the movement
  moved_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- Create indexes for better performance
CREATE INDEX idx_warehouse_inventory_grn_id ON warehouse_inventory(grn_id);
CREATE INDEX idx_warehouse_inventory_bin_id ON warehouse_inventory(bin_id);
CREATE INDEX idx_warehouse_inventory_status ON warehouse_inventory(status);
CREATE INDEX idx_warehouse_inventory_item_type ON warehouse_inventory(item_type);
CREATE INDEX idx_inventory_movements_inventory_id ON inventory_movements(inventory_id);
CREATE INDEX idx_inventory_movements_from_bin ON inventory_movements(from_bin_id);
CREATE INDEX idx_inventory_movements_to_bin ON inventory_movements(to_bin_id);

-- Enable RLS
ALTER TABLE warehouse_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
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

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers
CREATE TRIGGER update_warehouse_inventory_updated_at
  BEFORE UPDATE ON warehouse_inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE warehouse_inventory IS 'Tracks GRN items placed in warehouse bins';
COMMENT ON TABLE inventory_movements IS 'Tracks all movements of inventory between bins';

COMMENT ON COLUMN warehouse_inventory.grn_item_id IS 'Reference to the specific item in GRN';
COMMENT ON COLUMN warehouse_inventory.item_type IS 'Type of item: FABRIC, ITEM, or PRODUCT';
COMMENT ON COLUMN warehouse_inventory.item_id IS 'Reference to fabric_master or item_master table';
COMMENT ON COLUMN warehouse_inventory.bin_id IS 'Current bin location of the item';
COMMENT ON COLUMN warehouse_inventory.status IS 'Current status of the inventory item';
COMMENT ON COLUMN inventory_movements.movement_type IS 'Type of movement: TRANSFER, DISPATCH, QUARANTINE';

-- Verification queries
SELECT 'Warehouse inventory tracking tables created successfully' as status;

-- Note: Run warehouse_master_clean_setup.sql first to create bins table
-- Then you can run these verification queries:
-- SELECT COUNT(*) as total_bins FROM bins WHERE location_type = 'RECEIVING_ZONE';
-- SELECT COUNT(*) as total_storage_bins FROM bins WHERE location_type = 'STORAGE';
