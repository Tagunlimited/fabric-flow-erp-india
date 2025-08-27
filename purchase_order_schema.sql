-- Purchase Order Database Schema for Supabase SQL Editor
-- Run this in your Supabase SQL Editor

-- 1. Create purchase_orders table (Header)
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    po_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_id UUID NOT NULL REFERENCES supplier_master(id),
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery_date DATE,
    delivery_address TEXT,
    terms_conditions TEXT,
    subtotal DECIMAL(15,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'in_progress', 'completed', 'cancelled')),
    created_by UUID,
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create purchase_order_items table (Line Items)
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('fabric', 'item', 'product')),
    item_id UUID NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    item_image_url TEXT, -- URL to the item's image
    quantity DECIMAL(10,2) NOT NULL,
    unit_price DECIMAL(15,2) NOT NULL,
    total_price DECIMAL(15,2) NOT NULL,
    received_quantity DECIMAL(10,2) DEFAULT 0,
    unit_of_measure VARCHAR(20) DEFAULT 'pcs', -- pcs, kg, meters, etc.
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create purchase_order_deliveries table (Delivery Tracking)
CREATE TABLE IF NOT EXISTS purchase_order_deliveries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    delivery_number VARCHAR(50) NOT NULL,
    delivery_date DATE NOT NULL,
    delivered_quantity DECIMAL(10,2) NOT NULL,
    item_id UUID NOT NULL REFERENCES purchase_order_items(id),
    quality_status VARCHAR(20) DEFAULT 'pending' CHECK (quality_status IN ('pending', 'passed', 'failed', 'partial')),
    inspection_notes TEXT,
    received_by UUID,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create purchase_order_attachments table (Documents/Images)
CREATE TABLE IF NOT EXISTS purchase_order_attachments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_type VARCHAR(50) NOT NULL, -- pdf, image, excel, etc.
    file_size INTEGER, -- in bytes
    uploaded_by UUID,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_date ON purchase_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_item_type ON purchase_order_items(item_type);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_item_id ON purchase_order_items(item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_deliveries_po_id ON purchase_order_deliveries(po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_deliveries_delivery_date ON purchase_order_deliveries(delivery_date);

-- 6. Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_purchase_order_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Create trigger for purchase_orders
DROP TRIGGER IF EXISTS trigger_update_purchase_order_updated_at ON purchase_orders;
CREATE TRIGGER trigger_update_purchase_order_updated_at
    BEFORE UPDATE ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_purchase_order_updated_at();

-- 8. Create function to generate PO number
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    year_val VARCHAR(4);
    last_number INTEGER;
    next_number VARCHAR(3);
    po_number VARCHAR(50);
BEGIN
    year_val := EXTRACT(YEAR FROM CURRENT_DATE)::VARCHAR;
    
    -- Get the last PO number for current year
    SELECT COALESCE(
        (SELECT CAST(SUBSTRING(po_number FROM 8) AS INTEGER)
         FROM purchase_orders 
         WHERE po_number LIKE 'PO-' || year_val || '-%'
         ORDER BY po_number DESC 
         LIMIT 1), 0
    ) INTO last_number;
    
    next_number := LPAD((last_number + 1)::VARCHAR, 3, '0');
    po_number := 'PO-' || year_val || '-' || next_number;
    
    RETURN po_number;
END;
$$ LANGUAGE plpgsql;

-- 9. Create function to calculate PO totals
CREATE OR REPLACE FUNCTION calculate_po_totals(po_id_param UUID)
RETURNS TABLE (
    subtotal DECIMAL(15,2),
    tax_amount DECIMAL(15,2),
    total_amount DECIMAL(15,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(poi.total_price), 0) as subtotal,
        COALESCE(SUM(poi.total_price) * 0.18, 0) as tax_amount, -- 18% GST
        COALESCE(SUM(poi.total_price) * 1.18, 0) as total_amount
    FROM purchase_order_items poi
    WHERE poi.po_id = po_id_param;
END;
$$ LANGUAGE plpgsql;

-- 10. Create function to update PO totals when items change
CREATE OR REPLACE FUNCTION update_po_totals()
RETURNS TRIGGER AS $$
DECLARE
    totals RECORD;
BEGIN
    -- Calculate new totals
    SELECT * FROM calculate_po_totals(NEW.po_id) INTO totals;
    
    -- Update the purchase order
    UPDATE purchase_orders 
    SET 
        subtotal = totals.subtotal,
        tax_amount = totals.tax_amount,
        total_amount = totals.total_amount,
        updated_at = NOW()
    WHERE id = NEW.po_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 11. Create triggers for automatic total updates
DROP TRIGGER IF EXISTS trigger_update_po_totals_insert ON purchase_order_items;
CREATE TRIGGER trigger_update_po_totals_insert
    AFTER INSERT ON purchase_order_items
    FOR EACH ROW
    EXECUTE FUNCTION update_po_totals();

DROP TRIGGER IF EXISTS trigger_update_po_totals_update ON purchase_order_items;
CREATE TRIGGER trigger_update_po_totals_update
    AFTER UPDATE ON purchase_order_items
    FOR EACH ROW
    EXECUTE FUNCTION update_po_totals();

DROP TRIGGER IF EXISTS trigger_update_po_totals_delete ON purchase_order_items;
CREATE TRIGGER trigger_update_po_totals_delete
    AFTER DELETE ON purchase_order_items
    FOR EACH ROW
    EXECUTE FUNCTION update_po_totals();

-- 12. Create function to get PO with supplier details
CREATE OR REPLACE FUNCTION get_purchase_order_with_details(po_id_param UUID)
RETURNS TABLE (
    po_id UUID,
    po_number VARCHAR(50),
    supplier_id UUID,
    supplier_name VARCHAR(255),
    supplier_code VARCHAR(50),
    order_date DATE,
    expected_delivery_date DATE,
    delivery_address TEXT,
    terms_conditions TEXT,
    subtotal DECIMAL(15,2),
    tax_amount DECIMAL(15,2),
    total_amount DECIMAL(15,2),
    status VARCHAR(20),
    created_by UUID,
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        po.id as po_id,
        po.po_number,
        po.supplier_id,
        sm.supplier_name,
        sm.supplier_code,
        po.order_date,
        po.expected_delivery_date,
        po.delivery_address,
        po.terms_conditions,
        po.subtotal,
        po.tax_amount,
        po.total_amount,
        po.status,
        po.created_by,
        po.approved_by,
        po.approved_at,
        po.notes,
        po.created_at,
        po.updated_at
    FROM purchase_orders po
    LEFT JOIN supplier_master sm ON po.supplier_id = sm.id
    WHERE po.id = po_id_param;
END;
$$ LANGUAGE plpgsql;

-- 13. Enable Row Level Security (RLS)
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_attachments ENABLE ROW LEVEL SECURITY;

-- 14. Create RLS policies for purchase_orders
CREATE POLICY "Enable read access for authenticated users" ON purchase_orders
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON purchase_orders
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON purchase_orders
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON purchase_orders
    FOR DELETE USING (auth.role() = 'authenticated');

-- 15. Create RLS policies for purchase_order_items
CREATE POLICY "Enable read access for authenticated users" ON purchase_order_items
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON purchase_order_items
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON purchase_order_items
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON purchase_order_items
    FOR DELETE USING (auth.role() = 'authenticated');

-- 16. Create RLS policies for purchase_order_deliveries
CREATE POLICY "Enable read access for authenticated users" ON purchase_order_deliveries
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON purchase_order_deliveries
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON purchase_order_deliveries
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON purchase_order_deliveries
    FOR DELETE USING (auth.role() = 'authenticated');

-- 17. Create RLS policies for purchase_order_attachments
CREATE POLICY "Enable read access for authenticated users" ON purchase_order_attachments
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON purchase_order_attachments
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON purchase_order_attachments
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON purchase_order_attachments
    FOR DELETE USING (auth.role() = 'authenticated');

-- 18. Insert sample data (optional)
INSERT INTO purchase_orders (po_number, supplier_id, order_date, expected_delivery_date, delivery_address, status, subtotal, tax_amount, total_amount) VALUES
(generate_po_number(), (SELECT id FROM supplier_master WHERE supplier_code = 'SUP001' LIMIT 1), CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', '123 Main Street, Mumbai, Maharashtra - 400001', 'draft', 0, 0, 0),
(generate_po_number(), (SELECT id FROM supplier_master WHERE supplier_code = 'SUP002' LIMIT 1), CURRENT_DATE, CURRENT_DATE + INTERVAL '45 days', '456 Business Park, Surat, Gujarat - 395001', 'submitted', 0, 0, 0);

-- Success message
SELECT 'Purchase Order tables and functions created successfully!' as status;
