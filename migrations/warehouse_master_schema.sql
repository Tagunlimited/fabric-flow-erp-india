-- Warehouse Master Database Schema
-- Hierarchical structure: Warehouse → Floor → Rack → Bin

-- Create location type enum for bins
CREATE TYPE location_type AS ENUM (
  'RECEIVING_ZONE',
  'STORAGE',
  'DISPATCH_ZONE'
);

-- Warehouses table
CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'India',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Floors table (optional hierarchy)
CREATE TABLE IF NOT EXISTS floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  floor_number INTEGER NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(warehouse_id, floor_number)
);

-- Racks table
CREATE TABLE IF NOT EXISTS racks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  rack_code TEXT NOT NULL,
  description TEXT,
  capacity DECIMAL(10,2), -- in cubic meters
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(floor_id, rack_code)
);

-- Bins table (primary storage units)
CREATE TABLE IF NOT EXISTS bins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rack_id UUID NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
  bin_code TEXT NOT NULL,
  location_type location_type NOT NULL DEFAULT 'RECEIVING_ZONE',
  max_capacity DECIMAL(10,2) DEFAULT 0, -- in cubic meters
  current_capacity DECIMAL(10,2) DEFAULT 0, -- in cubic meters
  is_active BOOLEAN DEFAULT true,
  dimensions JSONB, -- {length, width, height} in meters
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rack_id, bin_code)
);

-- Create indexes for better performance
CREATE INDEX idx_warehouses_code ON warehouses(code);
CREATE INDEX idx_warehouses_active ON warehouses(is_active);
CREATE INDEX idx_floors_warehouse_id ON floors(warehouse_id);
CREATE INDEX idx_floors_floor_number ON floors(floor_number);
CREATE INDEX idx_racks_floor_id ON racks(floor_id);
CREATE INDEX idx_racks_code ON racks(rack_code);
CREATE INDEX idx_bins_rack_id ON bins(rack_id);
CREATE INDEX idx_bins_code ON bins(bin_code);
CREATE INDEX idx_bins_location_type ON bins(location_type);
CREATE INDEX idx_bins_active ON bins(is_active);

-- Enable Row Level Security (RLS)
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE racks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bins ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Authenticated users can view all warehouses"
  ON warehouses
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage warehouses"
  ON warehouses
  FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view all floors"
  ON floors
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage floors"
  ON floors
  FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view all racks"
  ON racks
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage racks"
  ON racks
  FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view all bins"
  ON bins
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage bins"
  ON bins
  FOR ALL
  TO authenticated
  USING (true);

-- Create trigger for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_warehouses_updated_at
  BEFORE UPDATE ON warehouses
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

-- Insert sample data
INSERT INTO warehouses (code, name, address, city, state, postal_code) VALUES
('WH001', 'Main Warehouse', '123 Industrial Area', 'Mumbai', 'Maharashtra', '400001'),
('WH002', 'Fabric Storage', '456 Textile Park', 'Ahmedabad', 'Gujarat', '380001')
ON CONFLICT (code) DO NOTHING;

-- Insert sample floors
INSERT INTO floors (warehouse_id, floor_number, description) 
SELECT w.id, 1, 'Ground Floor'
FROM warehouses w WHERE w.code = 'WH001'
ON CONFLICT (warehouse_id, floor_number) DO NOTHING;

INSERT INTO floors (warehouse_id, floor_number, description) 
SELECT w.id, 2, 'First Floor'
FROM warehouses w WHERE w.code = 'WH001'
ON CONFLICT (warehouse_id, floor_number) DO NOTHING;

-- Insert sample racks
INSERT INTO racks (floor_id, rack_code, description, capacity)
SELECT f.id, 'RACK-A', 'Main Rack A', 50.0
FROM floors f 
JOIN warehouses w ON f.warehouse_id = w.id 
WHERE w.code = 'WH001' AND f.floor_number = 1
ON CONFLICT (floor_id, rack_code) DO NOTHING;

INSERT INTO racks (floor_id, rack_code, description, capacity)
SELECT f.id, 'RACK-B', 'Main Rack B', 50.0
FROM floors f 
JOIN warehouses w ON f.warehouse_id = w.id 
WHERE w.code = 'WH001' AND f.floor_number = 1
ON CONFLICT (floor_id, rack_code) DO NOTHING;

-- Insert sample bins
INSERT INTO bins (rack_id, bin_code, location_type, max_capacity, dimensions)
SELECT r.id, 'BIN-01', 'RECEIVING_ZONE', 5.0, '{"length": 2.0, "width": 1.0, "height": 2.5}'
FROM racks r 
JOIN floors f ON r.floor_id = f.id
JOIN warehouses w ON f.warehouse_id = w.id 
WHERE w.code = 'WH001' AND f.floor_number = 1 AND r.rack_code = 'RACK-A'
ON CONFLICT (rack_id, bin_code) DO NOTHING;

INSERT INTO bins (rack_id, bin_code, location_type, max_capacity, dimensions)
SELECT r.id, 'BIN-02', 'STORAGE', 3.0, '{"length": 1.5, "width": 1.0, "height": 2.0}'
FROM racks r 
JOIN floors f ON r.floor_id = f.id
JOIN warehouses w ON f.warehouse_id = w.id 
WHERE w.code = 'WH001' AND f.floor_number = 1 AND r.rack_code = 'RACK-A'
ON CONFLICT (rack_id, bin_code) DO NOTHING;

INSERT INTO bins (rack_id, bin_code, location_type, max_capacity, dimensions)
SELECT r.id, 'BIN-03', 'DISPATCH_ZONE', 4.0, '{"length": 1.0, "width": 1.0, "height": 4.0}'
FROM racks r 
JOIN floors f ON r.floor_id = f.id
JOIN warehouses w ON f.warehouse_id = w.id 
WHERE w.code = 'WH001' AND f.floor_number = 1 AND r.rack_code = 'RACK-B'
ON CONFLICT (rack_id, bin_code) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE warehouses IS 'Master table for warehouse locations and facilities';
COMMENT ON TABLE floors IS 'Floor levels within warehouses (optional hierarchy)';
COMMENT ON TABLE racks IS 'Storage racks within floors';
COMMENT ON TABLE bins IS 'Individual storage bins within racks - primary storage units';

COMMENT ON COLUMN warehouses.code IS 'Unique warehouse code identifier';
COMMENT ON COLUMN warehouses.name IS 'Warehouse name';
COMMENT ON COLUMN warehouses.address IS 'Physical address of the warehouse';
COMMENT ON COLUMN floors.floor_number IS 'Floor number within the warehouse';
COMMENT ON COLUMN racks.capacity IS 'Rack capacity in cubic meters';
COMMENT ON COLUMN bins.location_type IS 'Type of storage zone: RECEIVING_ZONE (default for GRN), STORAGE (organized inventory), DISPATCH_ZONE (ready to ship)';
COMMENT ON COLUMN bins.max_capacity IS 'Maximum storage capacity in cubic meters';
COMMENT ON COLUMN bins.current_capacity IS 'Current used capacity in cubic meters';
COMMENT ON COLUMN bins.dimensions IS 'Physical dimensions as JSON: {length, width, height} in meters';
