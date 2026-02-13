-- Fix RLS policies for BOM tables to allow authenticated users to create and read BOMs

-- First, check if the tables exist and create them if they don't
DO $$
BEGIN
    -- Create bom_records table if it doesn't exist
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'bom_records' AND table_schema = 'public') THEN
        CREATE TABLE bom_records (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            bom_number TEXT NOT NULL UNIQUE,
            product_name TEXT NOT NULL,
            total_order_qty INTEGER NOT NULL DEFAULT 0,
            order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            created_by UUID REFERENCES auth.users(id),
            notes TEXT
        );
        RAISE NOTICE 'Created bom_records table';
    ELSE
        RAISE NOTICE 'bom_records table already exists';
    END IF;

    -- Create bom_record_items table if it doesn't exist
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'bom_record_items' AND table_schema = 'public') THEN
        CREATE TABLE bom_record_items (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            bom_id UUID REFERENCES bom_records(id) ON DELETE CASCADE,
            item_type TEXT NOT NULL,
            item_id UUID,
            item_name TEXT NOT NULL,
            item_image_url TEXT,
            quantity INTEGER NOT NULL DEFAULT 0,
            unit_of_measure TEXT DEFAULT 'pcs',
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            -- Fabric specific fields
            fabric_name TEXT,
            fabric_color TEXT,
            fabric_gsm TEXT,
            -- Item specific fields
            category TEXT,
            gst_rate DECIMAL(5,2) DEFAULT 18.00,
            -- BOM specific fields
            qty_per_product DECIMAL(10,2) DEFAULT 0,
            qty_total DECIMAL(10,2) DEFAULT 0,
            stock DECIMAL(10,2) DEFAULT 0,
            to_order DECIMAL(10,2) DEFAULT 0
        );
        RAISE NOTICE 'Created bom_record_items table';
    ELSE
        RAISE NOTICE 'bom_record_items table already exists';
    END IF;
END $$;

-- Enable RLS on both tables
ALTER TABLE bom_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_record_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for all users" ON bom_records;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON bom_records;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON bom_records;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON bom_records;

DROP POLICY IF EXISTS "Enable read access for all users" ON bom_record_items;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON bom_record_items;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON bom_record_items;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON bom_record_items;

-- Create comprehensive RLS policies for bom_records
CREATE POLICY "Enable read access for all users" ON bom_records
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON bom_records
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON bom_records
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users only" ON bom_records
    FOR DELETE USING (auth.role() = 'authenticated');

-- Create comprehensive RLS policies for bom_record_items
CREATE POLICY "Enable read access for all users" ON bom_record_items
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON bom_record_items
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON bom_record_items
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users only" ON bom_record_items
    FOR DELETE USING (auth.role() = 'authenticated');

-- Grant necessary permissions
GRANT ALL ON bom_records TO postgres, anon, authenticated, service_role;
GRANT ALL ON bom_record_items TO postgres, anon, authenticated, service_role;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bom_records_order_id ON bom_records(order_id);
CREATE INDEX IF NOT EXISTS idx_bom_records_created_at ON bom_records(created_at);
CREATE INDEX IF NOT EXISTS idx_bom_record_items_bom_id ON bom_record_items(bom_id);
CREATE INDEX IF NOT EXISTS idx_bom_record_items_item_type ON bom_record_items(item_type);

-- Create triggers to update updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_bom_records_updated_at ON bom_records;
DROP TRIGGER IF EXISTS update_bom_record_items_updated_at ON bom_record_items;

-- Create triggers
CREATE TRIGGER update_bom_records_updated_at
    BEFORE UPDATE ON bom_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bom_record_items_updated_at
    BEFORE UPDATE ON bom_record_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Verify the setup
DO $$
BEGIN
    RAISE NOTICE 'BOM tables RLS policies setup completed successfully!';
    RAISE NOTICE 'Tables created/verified: bom_records, bom_record_items';
    RAISE NOTICE 'RLS policies created for both tables';
    RAISE NOTICE 'Permissions granted to all roles';
    RAISE NOTICE 'Indexes and triggers created';
END $$;
