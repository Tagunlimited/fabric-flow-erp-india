-- Supplier Master Setup SQL for Supabase SQL Editor
-- Run this in your Supabase SQL Editor

-- 1. Create supplier_master table
CREATE TABLE IF NOT EXISTS supplier_master (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    supplier_code VARCHAR(50) UNIQUE NOT NULL,
    supplier_name VARCHAR(255) NOT NULL,
    credit_limit DECIMAL(15,2) DEFAULT 0,
    pan VARCHAR(10),
    gst_number VARCHAR(15),
    contact_person VARCHAR(255),
    phone VARCHAR(20),
    email VARCHAR(255),
    billing_address TEXT,
    enabled BOOLEAN DEFAULT true,
    total_outstanding_amount DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create supplier_specializations table
CREATE TABLE IF NOT EXISTS supplier_specializations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    supplier_id UUID NOT NULL REFERENCES supplier_master(id) ON DELETE CASCADE,
    specialization_type VARCHAR(20) NOT NULL CHECK (specialization_type IN ('fabric', 'item', 'product')),
    specialization_id UUID NOT NULL,
    specialization_name VARCHAR(255) NOT NULL,
    priority INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(supplier_id, specialization_type, specialization_id)
);

-- 3. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_supplier_master_supplier_code ON supplier_master(supplier_code);
CREATE INDEX IF NOT EXISTS idx_supplier_master_enabled ON supplier_master(enabled);
CREATE INDEX IF NOT EXISTS idx_supplier_specializations_supplier_id ON supplier_specializations(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_specializations_type_id ON supplier_specializations(specialization_type, specialization_id);

-- 4. Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_supplier_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger for supplier_master
DROP TRIGGER IF EXISTS trigger_update_supplier_updated_at ON supplier_master;
CREATE TRIGGER trigger_update_supplier_updated_at
    BEFORE UPDATE ON supplier_master
    FOR EACH ROW
    EXECUTE FUNCTION update_supplier_updated_at();

-- 6. Create function to get best suppliers
CREATE OR REPLACE FUNCTION get_best_suppliers(
    p_specialization_type VARCHAR(20),
    p_specialization_id UUID,
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    supplier_id UUID,
    supplier_code VARCHAR(50),
    supplier_name VARCHAR(255),
    contact_person VARCHAR(255),
    phone VARCHAR(20),
    email VARCHAR(255),
    credit_limit DECIMAL(15,2),
    total_outstanding_amount DECIMAL(15,2),
    specialization_priority INTEGER,
    specialization_name VARCHAR(255)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sm.id as supplier_id,
        sm.supplier_code,
        sm.supplier_name,
        sm.contact_person,
        sm.phone,
        sm.email,
        sm.credit_limit,
        sm.total_outstanding_amount,
        ss.priority as specialization_priority,
        ss.specialization_name
    FROM supplier_master sm
    INNER JOIN supplier_specializations ss ON sm.id = ss.supplier_id
    WHERE sm.enabled = true
        AND ss.specialization_type = p_specialization_type
        AND ss.specialization_id = p_specialization_id
    ORDER BY ss.priority DESC, sm.total_outstanding_amount ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 7. Enable Row Level Security (RLS)
ALTER TABLE supplier_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_specializations ENABLE ROW LEVEL SECURITY;

-- 8. Create RLS policies for supplier_master
CREATE POLICY "Enable read access for authenticated users" ON supplier_master
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON supplier_master
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON supplier_master
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON supplier_master
    FOR DELETE USING (auth.role() = 'authenticated');

-- 9. Create RLS policies for supplier_specializations
CREATE POLICY "Enable read access for authenticated users" ON supplier_specializations
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON supplier_specializations
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON supplier_specializations
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON supplier_specializations
    FOR DELETE USING (auth.role() = 'authenticated');

-- 10. Insert some sample data (optional)
INSERT INTO supplier_master (supplier_code, supplier_name, credit_limit, pan, gst_number, contact_person, phone, email, billing_address) VALUES
('SUP001', 'ABC Fabrics Ltd', 100000.00, 'ABCDE1234F', '27ABCDE1234F1Z5', 'John Doe', '+91-9876543210', 'john@abcfabrics.com', '123 Fabric Street, Mumbai, Maharashtra'),
('SUP002', 'XYZ Textiles', 75000.00, 'XYZAB5678G', '27XYZAB5678G2Z6', 'Jane Smith', '+91-9876543211', 'jane@xyztextiles.com', '456 Textile Road, Surat, Gujarat'),
('SUP003', 'Quality Materials Co', 150000.00, 'QUALM9012H', '27QUALM9012H3Z7', 'Mike Johnson', '+91-9876543212', 'mike@qualitymaterials.com', '789 Material Avenue, Delhi, Delhi');

-- 11. Insert sample specializations (optional - you'll need to replace UUIDs with actual fabric/item/product IDs)
-- Note: Replace the specialization_id UUIDs with actual IDs from your fabric_master, item_master, or product_master tables
-- INSERT INTO supplier_specializations (supplier_id, specialization_type, specialization_id, specialization_name, priority) VALUES
-- ((SELECT id FROM supplier_master WHERE supplier_code = 'SUP001'), 'fabric', 'your-fabric-id-here', 'Cotton Fabric', 1),
-- ((SELECT id FROM supplier_master WHERE supplier_code = 'SUP002'), 'item', 'your-item-id-here', 'Zipper', 1),
-- ((SELECT id FROM supplier_master WHERE supplier_code = 'SUP003'), 'product', 'your-product-id-here', 'T-Shirt', 1);

-- Success message
SELECT 'Supplier Master tables and functions created successfully!' as status;
