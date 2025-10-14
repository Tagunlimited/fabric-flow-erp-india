-- Ensure all fabric-related tables exist with correct schema
-- This migration fixes fabric picking functionality

-- 1. Create fabric_storage_zones table if it doesn't exist
CREATE TABLE IF NOT EXISTS fabric_storage_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_name TEXT NOT NULL,
    zone_code TEXT UNIQUE NOT NULL,
    warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
    capacity DECIMAL(10,2),
    current_usage DECIMAL(10,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create fabric_inventory table if it doesn't exist
CREATE TABLE IF NOT EXISTS fabric_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fabric_id UUID REFERENCES fabrics(id) ON DELETE CASCADE,
    storage_zone_id UUID REFERENCES fabric_storage_zones(id) ON DELETE CASCADE,
    available_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
    reserved_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
    unit TEXT DEFAULT 'meters',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(fabric_id, storage_zone_id)
);

-- 3. Ensure fabric_picking_records table exists (recreate if needed)
DROP TABLE IF EXISTS fabric_picking_records CASCADE;
CREATE TABLE fabric_picking_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    fabric_id UUID REFERENCES fabrics(id) ON DELETE CASCADE,
    storage_zone_id UUID REFERENCES fabric_storage_zones(id) ON DELETE SET NULL,
    picked_quantity DECIMAL(10,2) NOT NULL,
    unit TEXT DEFAULT 'meters',
    picked_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    picked_by_name TEXT,
    picked_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create fabric_usage_records table if it doesn't exist
CREATE TABLE IF NOT EXISTS fabric_usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    fabric_id UUID REFERENCES fabrics(id) ON DELETE CASCADE,
    planned_quantity DECIMAL(10,2),
    actual_quantity DECIMAL(10,2),
    wastage_quantity DECIMAL(10,2),
    unit TEXT DEFAULT 'meters',
    used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_fabric_storage_zones_code ON fabric_storage_zones(zone_code);
CREATE INDEX IF NOT EXISTS idx_fabric_inventory_fabric ON fabric_inventory(fabric_id);
CREATE INDEX IF NOT EXISTS idx_fabric_inventory_zone ON fabric_inventory(storage_zone_id);
CREATE INDEX IF NOT EXISTS idx_fabric_picking_records_order_id ON fabric_picking_records(order_id);
CREATE INDEX IF NOT EXISTS idx_fabric_picking_records_fabric_id ON fabric_picking_records(fabric_id);
CREATE INDEX IF NOT EXISTS idx_fabric_picking_records_picked_by_id ON fabric_picking_records(picked_by_id);
CREATE INDEX IF NOT EXISTS idx_fabric_picking_records_picked_at ON fabric_picking_records(picked_at);
CREATE INDEX IF NOT EXISTS idx_fabric_usage_records_order_id ON fabric_usage_records(order_id);
CREATE INDEX IF NOT EXISTS idx_fabric_usage_records_fabric_id ON fabric_usage_records(fabric_id);

-- Enable RLS (Row Level Security) for all tables
ALTER TABLE fabric_storage_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_picking_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_usage_records ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for fabric_storage_zones
CREATE POLICY "Users can view fabric storage zones" ON fabric_storage_zones
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert fabric storage zones" ON fabric_storage_zones
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update fabric storage zones" ON fabric_storage_zones
    FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Create RLS policies for fabric_inventory
CREATE POLICY "Users can view fabric inventory" ON fabric_inventory
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert fabric inventory" ON fabric_inventory
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update fabric inventory" ON fabric_inventory
    FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Create RLS policies for fabric_picking_records
CREATE POLICY "Users can view fabric picking records" ON fabric_picking_records
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert fabric picking records" ON fabric_picking_records
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update fabric picking records" ON fabric_picking_records
    FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete fabric picking records" ON fabric_picking_records
    FOR DELETE USING (auth.uid() IS NOT NULL);

-- Create RLS policies for fabric_usage_records
CREATE POLICY "Users can view fabric usage records" ON fabric_usage_records
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert fabric usage records" ON fabric_usage_records
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update fabric usage records" ON fabric_usage_records
    FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Grant permissions
GRANT ALL ON fabric_storage_zones TO authenticated;
GRANT ALL ON fabric_storage_zones TO service_role;
GRANT ALL ON fabric_inventory TO authenticated;
GRANT ALL ON fabric_inventory TO service_role;
GRANT ALL ON fabric_picking_records TO authenticated;
GRANT ALL ON fabric_picking_records TO service_role;
GRANT ALL ON fabric_usage_records TO authenticated;
GRANT ALL ON fabric_usage_records TO service_role;
