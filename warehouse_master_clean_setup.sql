-- Warehouse Master Clean Setup
-- Drops existing tables and creates fresh ones with correct structure

-- Drop existing tables in correct order (due to foreign key constraints)
DROP TABLE IF EXISTS bins CASCADE;
DROP TABLE IF EXISTS racks CASCADE;
DROP TABLE IF EXISTS floors CASCADE;
DROP TABLE IF EXISTS warehouses CASCADE;

-- Drop existing location_type enum if it exists
DROP TYPE IF EXISTS location_type CASCADE;

-- Create new location type enum for bins
CREATE TYPE location_type AS ENUM (
  'RECEIVING_ZONE',
  'STORAGE',
  'DISPATCH_ZONE'
);

-- Warehouses table
CREATE TABLE warehouses (
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
CREATE TABLE floors (
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
CREATE TABLE racks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  rack_code TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(floor_id, rack_code)
);

-- Bins table (primary storage units)
CREATE TABLE bins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rack_id UUID NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
  bin_code TEXT NOT NULL,
  location_type location_type NOT NULL DEFAULT 'RECEIVING_ZONE',
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

-- Create trigger function for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatic timestamp updates
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
('WH002', 'Fabric Storage', '456 Textile Park', 'Ahmedabad', 'Gujarat', '380001');

-- Insert sample floors
INSERT INTO floors (warehouse_id, floor_number, description) 
SELECT w.id, 1, 'Ground Floor'
FROM warehouses w WHERE w.code = 'WH001';

INSERT INTO floors (warehouse_id, floor_number, description) 
SELECT w.id, 2, 'First Floor'
FROM warehouses w WHERE w.code = 'WH001';

-- Insert sample racks
INSERT INTO racks (floor_id, rack_code, description)
SELECT f.id, 'RACK-A', 'Main Rack A'
FROM floors f 
JOIN warehouses w ON f.warehouse_id = w.id 
WHERE w.code = 'WH001' AND f.floor_number = 1;

INSERT INTO racks (floor_id, rack_code, description)
SELECT f.id, 'RACK-B', 'Main Rack B'
FROM floors f 
JOIN warehouses w ON f.warehouse_id = w.id 
WHERE w.code = 'WH001' AND f.floor_number = 1;

-- Insert sample bins
INSERT INTO bins (rack_id, bin_code, location_type, dimensions)
SELECT r.id, 'BIN-01', 'RECEIVING_ZONE', '{"length": 2.0, "width": 1.0, "height": 2.5}'
FROM racks r 
JOIN floors f ON r.floor_id = f.id
JOIN warehouses w ON f.warehouse_id = w.id 
WHERE w.code = 'WH001' AND f.floor_number = 1 AND r.rack_code = 'RACK-A';

INSERT INTO bins (rack_id, bin_code, location_type, dimensions)
SELECT r.id, 'BIN-02', 'STORAGE', '{"length": 1.5, "width": 1.0, "height": 2.0}'
FROM racks r 
JOIN floors f ON r.floor_id = f.id
JOIN warehouses w ON f.warehouse_id = w.id 
WHERE w.code = 'WH001' AND f.floor_number = 1 AND r.rack_code = 'RACK-A';

INSERT INTO bins (rack_id, bin_code, location_type, dimensions)
SELECT r.id, 'BIN-03', 'DISPATCH_ZONE', '{"length": 1.0, "width": 1.0, "height": 4.0}'
FROM racks r 
JOIN floors f ON r.floor_id = f.id
JOIN warehouses w ON f.warehouse_id = w.id 
WHERE w.code = 'WH001' AND f.floor_number = 1 AND r.rack_code = 'RACK-B';

-- Add comments for documentation
COMMENT ON TABLE warehouses IS 'Master table for warehouse locations and facilities';
COMMENT ON TABLE floors IS 'Floor levels within warehouses (optional hierarchy)';
COMMENT ON TABLE racks IS 'Storage racks within floors';
COMMENT ON TABLE bins IS 'Individual storage bins within racks - primary storage units';

COMMENT ON COLUMN warehouses.code IS 'Unique warehouse code identifier';
COMMENT ON COLUMN warehouses.name IS 'Warehouse name';
COMMENT ON COLUMN warehouses.address IS 'Physical address of the warehouse';
COMMENT ON COLUMN floors.floor_number IS 'Floor number within the warehouse';
COMMENT ON COLUMN bins.location_type IS 'Type of storage zone: RECEIVING_ZONE (default for GRN), STORAGE (organized inventory), DISPATCH_ZONE (ready to ship)';
COMMENT ON COLUMN bins.dimensions IS 'Physical dimensions as JSON: {length, width, height} in meters';

-- Verification queries
SELECT 'Warehouse Master tables created successfully' as status;
SELECT COUNT(*) as total_warehouses FROM warehouses;
SELECT COUNT(*) as total_floors FROM floors;
SELECT COUNT(*) as total_racks FROM racks;
SELECT COUNT(*) as total_bins FROM bins;

-- Show the structure of bins table to verify location_type column exists
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'bins' 
ORDER BY ordinal_position;
