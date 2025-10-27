-- Create warehouse infrastructure - handle existing tables
-- This will fix the "approved GRN fabric not showing in inventory" issue

-- 1. Create warehouses table (if not exists)
CREATE TABLE IF NOT EXISTS warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(20),
    contact_person VARCHAR(255),
    phone VARCHAR(20),
    email VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Create floors table
CREATE TABLE IF NOT EXISTS warehouse_floors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    floor_number INTEGER NOT NULL,
    floor_name VARCHAR(255),
    description TEXT,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(warehouse_id, floor_number)
);

-- 3. Create racks table
CREATE TABLE IF NOT EXISTS warehouse_racks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    floor_id UUID NOT NULL REFERENCES warehouse_floors(id) ON DELETE CASCADE,
    rack_code VARCHAR(50) NOT NULL,
    rack_name VARCHAR(255),
    description TEXT,
    capacity INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(floor_id, rack_code)
);

-- 4. Create bins table
CREATE TABLE IF NOT EXISTS warehouse_bins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rack_id UUID NOT NULL REFERENCES warehouse_racks(id) ON DELETE CASCADE,
    bin_code VARCHAR(50) NOT NULL,
    bin_name VARCHAR(255),
    location_type VARCHAR(50) NOT NULL CHECK (location_type IN ('RECEIVING_ZONE', 'STORAGE', 'DISPATCH_ZONE')),
    capacity INTEGER DEFAULT 0,
    current_quantity INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(rack_id, bin_code)
);

-- 5. Enable RLS on all tables
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_racks ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_bins ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies
CREATE POLICY IF NOT EXISTS "Enable read access for all users" ON warehouses FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Enable insert for authenticated users only" ON warehouses FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Enable update for authenticated users only" ON warehouses FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Enable delete for authenticated users only" ON warehouses FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "Enable read access for all users" ON warehouse_floors FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Enable insert for authenticated users only" ON warehouse_floors FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Enable update for authenticated users only" ON warehouse_floors FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Enable delete for authenticated users only" ON warehouse_floors FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "Enable read access for all users" ON warehouse_racks FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Enable insert for authenticated users only" ON warehouse_racks FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Enable update for authenticated users only" ON warehouse_racks FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Enable delete for authenticated users only" ON warehouse_racks FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "Enable read access for all users" ON warehouse_bins FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Enable insert for authenticated users only" ON warehouse_bins FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Enable update for authenticated users only" ON warehouse_bins FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Enable delete for authenticated users only" ON warehouse_bins FOR DELETE USING (auth.role() = 'authenticated');

-- 7. Grant permissions
GRANT ALL ON warehouses TO postgres, anon, authenticated, service_role;
GRANT ALL ON warehouse_floors TO postgres, anon, authenticated, service_role;
GRANT ALL ON warehouse_racks TO postgres, anon, authenticated, service_role;
GRANT ALL ON warehouse_bins TO postgres, anon, authenticated, service_role;

-- 8. Create default warehouse structure (handle existing warehouses table)
INSERT INTO warehouses (id, name, code) 
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Main Warehouse',
    'MAIN-WH'
) ON CONFLICT (code) DO NOTHING;

-- 9. Create default floor
INSERT INTO warehouse_floors (id, warehouse_id, floor_number, floor_name, description)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    1,
    'Ground Floor',
    'Main storage floor'
) ON CONFLICT (warehouse_id, floor_number) DO NOTHING;

-- 10. Create default racks
INSERT INTO warehouse_racks (id, floor_id, rack_code, rack_name, description, capacity)
VALUES 
    ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'RACK-001', 'Receiving Rack', 'For receiving new items', 1000),
    ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'RACK-002', 'Storage Rack', 'For storing items', 2000),
    ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', 'RACK-003', 'Dispatch Rack', 'For items ready to dispatch', 500)
ON CONFLICT (floor_id, rack_code) DO NOTHING;

-- 11. Create default bins
INSERT INTO warehouse_bins (id, rack_id, bin_code, bin_name, location_type, capacity)
VALUES 
    -- Receiving zone bins
    ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000003', 'REC-001', 'Receiving Bin 1', 'RECEIVING_ZONE', 100),
    ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000003', 'REC-002', 'Receiving Bin 2', 'RECEIVING_ZONE', 100),
    ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000003', 'REC-003', 'Receiving Bin 3', 'RECEIVING_ZONE', 100),
    
    -- Storage zone bins
    ('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000004', 'STO-001', 'Storage Bin 1', 'STORAGE', 200),
    ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000004', 'STO-002', 'Storage Bin 2', 'STORAGE', 200),
    ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000004', 'STO-003', 'Storage Bin 3', 'STORAGE', 200),
    
    -- Dispatch zone bins
    ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000005', 'DIS-001', 'Dispatch Bin 1', 'DISPATCH_ZONE', 50),
    ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000005', 'DIS-002', 'Dispatch Bin 2', 'DISPATCH_ZONE', 50)
ON CONFLICT (rack_id, bin_code) DO NOTHING;

-- 12. Create function to find default receiving bin
CREATE OR REPLACE FUNCTION find_default_receiving_bin()
RETURNS UUID AS $$
DECLARE
    bin_id UUID;
BEGIN
    SELECT id INTO bin_id
    FROM warehouse_bins
    WHERE location_type = 'RECEIVING_ZONE'
    AND status = 'active'
    ORDER BY created_at ASC
    LIMIT 1;
    
    RETURN bin_id;
END;
$$ LANGUAGE plpgsql;

-- 13. Add triggers for updated_at
CREATE TRIGGER IF NOT EXISTS handle_updated_at_warehouses BEFORE UPDATE ON warehouses
FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

CREATE TRIGGER IF NOT EXISTS handle_updated_at_warehouse_floors BEFORE UPDATE ON warehouse_floors
FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

CREATE TRIGGER IF NOT EXISTS handle_updated_at_warehouse_racks BEFORE UPDATE ON warehouse_racks
FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

CREATE TRIGGER IF NOT EXISTS handle_updated_at_warehouse_bins BEFORE UPDATE ON warehouse_bins
FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

-- Success message
SELECT 'Warehouse infrastructure created successfully!' as status;
