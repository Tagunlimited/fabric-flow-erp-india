-- Fix fabric_picking_records table column names to match component expectations
-- This migration fixes the "Could not find the 'picked_by_id' column" error

-- Drop and recreate the table with correct column names
DROP TABLE IF EXISTS fabric_picking_records CASCADE;

-- Create fabric_picking_records table with correct schema matching component
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

-- Create indexes for better performance
CREATE INDEX idx_fabric_picking_records_order_id ON fabric_picking_records(order_id);
CREATE INDEX idx_fabric_picking_records_fabric_id ON fabric_picking_records(fabric_id);
CREATE INDEX idx_fabric_picking_records_storage_zone_id ON fabric_picking_records(storage_zone_id);
CREATE INDEX idx_fabric_picking_records_picked_by_id ON fabric_picking_records(picked_by_id);
CREATE INDEX idx_fabric_picking_records_picked_at ON fabric_picking_records(picked_at);

-- Enable RLS (Row Level Security)
ALTER TABLE fabric_picking_records ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view fabric picking records" ON fabric_picking_records
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert fabric picking records" ON fabric_picking_records
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update fabric picking records" ON fabric_picking_records
    FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete fabric picking records" ON fabric_picking_records
    FOR DELETE USING (auth.uid() IS NOT NULL);

-- Grant permissions
GRANT ALL ON fabric_picking_records TO authenticated;
GRANT ALL ON fabric_picking_records TO service_role;

-- Ensure fabric_storage_zones table exists (required for foreign key)
CREATE TABLE IF NOT EXISTS fabric_storage_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_name TEXT NOT NULL,
    zone_code TEXT UNIQUE NOT NULL,
    location TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grant permissions for fabric_storage_zones
GRANT ALL ON fabric_storage_zones TO authenticated;
GRANT ALL ON fabric_storage_zones TO service_role;
