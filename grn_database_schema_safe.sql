-- Goods Receipt Note (GRN) Database Schema - Safe Version
-- This version handles existing objects gracefully
-- Run this in your Supabase SQL Editor

-- 1. Create grn_master table (Header) - with IF NOT EXISTS
CREATE TABLE IF NOT EXISTS grn_master (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    grn_number VARCHAR(50) UNIQUE NOT NULL,
    po_id UUID NOT NULL REFERENCES purchase_orders(id),
    supplier_id UUID NOT NULL REFERENCES supplier_master(id),
    grn_date DATE NOT NULL DEFAULT CURRENT_DATE,
    received_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    received_by UUID, -- User who received the goods
    received_at_location TEXT, -- Warehouse/location where goods were received
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'received', 'under_inspection', 'approved', 'rejected', 'partially_approved')),
    total_items_received INTEGER DEFAULT 0,
    total_items_approved INTEGER DEFAULT 0,
    total_items_rejected INTEGER DEFAULT 0,
    total_amount_received DECIMAL(15,2) DEFAULT 0,
    total_amount_approved DECIMAL(15,2) DEFAULT 0,
    quality_inspector UUID, -- User who performed quality inspection
    inspection_date TIMESTAMP WITH TIME ZONE,
    inspection_notes TEXT,
    approved_by UUID, -- User who approved the GRN
    approved_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create grn_items table (Line Items) - with IF NOT EXISTS
CREATE TABLE IF NOT EXISTS grn_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    grn_id UUID NOT NULL REFERENCES grn_master(id) ON DELETE CASCADE,
    po_item_id UUID NOT NULL, -- Reference to purchase_order_items
    item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('fabric', 'item', 'product')),
    item_id UUID NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    item_image_url TEXT,
    ordered_quantity DECIMAL(10,2) NOT NULL,
    received_quantity DECIMAL(10,2) NOT NULL,
    approved_quantity DECIMAL(10,2) DEFAULT 0,
    rejected_quantity DECIMAL(10,2) DEFAULT 0,
    unit_of_measure VARCHAR(20) DEFAULT 'pcs',
    unit_price DECIMAL(15,2) NOT NULL,
    total_price DECIMAL(15,2) NOT NULL,
    gst_rate DECIMAL(5,2) DEFAULT 0,
    gst_amount DECIMAL(15,2) DEFAULT 0,
    line_total DECIMAL(15,2) NOT NULL,
    quality_status VARCHAR(20) DEFAULT 'pending' CHECK (quality_status IN ('pending', 'approved', 'rejected', 'damaged')),
    batch_number VARCHAR(100),
    expiry_date DATE,
    condition_notes TEXT,
    inspection_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create grn_quality_inspections table (Detailed Quality Control) - with IF NOT EXISTS
CREATE TABLE IF NOT EXISTS grn_quality_inspections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    grn_item_id UUID NOT NULL REFERENCES grn_items(id) ON DELETE CASCADE,
    inspection_type VARCHAR(50) NOT NULL, -- 'visual', 'dimensional', 'functional', 'chemical', etc.
    inspection_criteria TEXT,
    expected_result TEXT,
    actual_result TEXT,
    inspection_status VARCHAR(20) DEFAULT 'pending' CHECK (inspection_status IN ('pending', 'passed', 'failed', 'conditional')),
    inspector_id UUID, -- User who performed this specific inspection
    inspection_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    inspection_notes TEXT,
    photos_urls TEXT[], -- Array of photo URLs
    test_certificates_urls TEXT[], -- Array of certificate URLs
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create grn_discrepancies table (Track discrepancies) - with IF NOT EXISTS
CREATE TABLE IF NOT EXISTS grn_discrepancies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    grn_id UUID NOT NULL REFERENCES grn_master(id) ON DELETE CASCADE,
    grn_item_id UUID REFERENCES grn_items(id) ON DELETE CASCADE,
    discrepancy_type VARCHAR(50) NOT NULL CHECK (discrepancy_type IN ('quantity_short', 'quantity_excess', 'quality_issue', 'damage', 'wrong_item', 'missing_documentation')),
    description TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    impact_on_payment BOOLEAN DEFAULT false,
    resolution_status VARCHAR(20) DEFAULT 'open' CHECK (resolution_status IN ('open', 'in_progress', 'resolved', 'escalated')),
    resolution_notes TEXT,
    resolved_by UUID,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create grn_attachments table (Supporting documents) - with IF NOT EXISTS
CREATE TABLE IF NOT EXISTS grn_attachments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    grn_id UUID NOT NULL REFERENCES grn_master(id) ON DELETE CASCADE,
    attachment_type VARCHAR(50) NOT NULL CHECK (attachment_type IN ('delivery_challan', 'test_certificate', 'quality_report', 'photo', 'other')),
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100),
    uploaded_by UUID,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Create indexes for better performance - with IF NOT EXISTS
CREATE INDEX IF NOT EXISTS idx_grn_master_grn_number ON grn_master(grn_number);
CREATE INDEX IF NOT EXISTS idx_grn_master_po_id ON grn_master(po_id);
CREATE INDEX IF NOT EXISTS idx_grn_master_supplier_id ON grn_master(supplier_id);
CREATE INDEX IF NOT EXISTS idx_grn_master_status ON grn_master(status);
CREATE INDEX IF NOT EXISTS idx_grn_master_grn_date ON grn_master(grn_date);

CREATE INDEX IF NOT EXISTS idx_grn_items_grn_id ON grn_items(grn_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_po_item_id ON grn_items(po_item_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_item_id ON grn_items(item_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_quality_status ON grn_items(quality_status);

CREATE INDEX IF NOT EXISTS idx_grn_quality_inspections_grn_item_id ON grn_quality_inspections(grn_item_id);
CREATE INDEX IF NOT EXISTS idx_grn_quality_inspections_inspection_status ON grn_quality_inspections(inspection_status);

CREATE INDEX IF NOT EXISTS idx_grn_discrepancies_grn_id ON grn_discrepancies(grn_id);
CREATE INDEX IF NOT EXISTS idx_grn_discrepancies_resolution_status ON grn_discrepancies(resolution_status);

CREATE INDEX IF NOT EXISTS idx_grn_attachments_grn_id ON grn_attachments(grn_id);

-- 7. Create trigger function for updated_at timestamp - with IF NOT EXISTS
CREATE OR REPLACE FUNCTION update_grn_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Drop existing triggers if they exist, then create new ones
DROP TRIGGER IF EXISTS trigger_update_grn_master_updated_at ON grn_master;
CREATE TRIGGER trigger_update_grn_master_updated_at
    BEFORE UPDATE ON grn_master
    FOR EACH ROW
    EXECUTE FUNCTION update_grn_updated_at();

DROP TRIGGER IF EXISTS trigger_update_grn_items_updated_at ON grn_items;
CREATE TRIGGER trigger_update_grn_items_updated_at
    BEFORE UPDATE ON grn_items
    FOR EACH ROW
    EXECUTE FUNCTION update_grn_updated_at();

-- 9. Create function to generate GRN number - with OR REPLACE
CREATE OR REPLACE FUNCTION generate_grn_number()
RETURNS TEXT AS $$
DECLARE
    new_number TEXT;
    counter INTEGER;
BEGIN
    -- Get the current counter value
    SELECT COALESCE(MAX(CAST(SUBSTRING(grn_number FROM 4) AS INTEGER)), 0) + 1
    INTO counter
    FROM grn_master
    WHERE grn_number LIKE 'GRN-%';
    
    -- Format the new number
    new_number := 'GRN-' || LPAD(counter::TEXT, 6, '0');
    
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- 10. Create function to update GRN totals - with OR REPLACE
CREATE OR REPLACE FUNCTION update_grn_totals(grn_uuid UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE grn_master 
    SET 
        total_items_received = (
            SELECT COUNT(*) FROM grn_items WHERE grn_id = grn_uuid
        ),
        total_items_approved = (
            SELECT COUNT(*) FROM grn_items WHERE grn_id = grn_uuid AND quality_status = 'approved'
        ),
        total_items_rejected = (
            SELECT COUNT(*) FROM grn_items WHERE grn_id = grn_uuid AND quality_status = 'rejected'
        ),
        total_amount_received = (
            SELECT COALESCE(SUM(line_total), 0) FROM grn_items WHERE grn_id = grn_uuid
        ),
        total_amount_approved = (
            SELECT COALESCE(SUM(line_total), 0) FROM grn_items WHERE grn_id = grn_uuid AND quality_status = 'approved'
        ),
        updated_at = NOW()
    WHERE id = grn_uuid;
END;
$$ LANGUAGE plpgsql;

-- 11. Drop existing trigger if it exists, then create new one
DROP TRIGGER IF EXISTS trigger_grn_items_update_totals ON grn_items;
CREATE OR REPLACE FUNCTION trigger_update_grn_totals()
RETURNS TRIGGER AS $$
BEGIN
    -- Update totals for the affected GRN
    PERFORM update_grn_totals(COALESCE(NEW.grn_id, OLD.grn_id));
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_grn_items_update_totals
    AFTER INSERT OR UPDATE OR DELETE ON grn_items
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_grn_totals();

-- 12. Enable Row Level Security (RLS) - with IF NOT EXISTS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = 'grn_master' AND relrowsecurity = true
    ) THEN
        ALTER TABLE grn_master ENABLE ROW LEVEL SECURITY;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = 'grn_items' AND relrowsecurity = true
    ) THEN
        ALTER TABLE grn_items ENABLE ROW LEVEL SECURITY;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = 'grn_quality_inspections' AND relrowsecurity = true
    ) THEN
        ALTER TABLE grn_quality_inspections ENABLE ROW LEVEL SECURITY;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = 'grn_discrepancies' AND relrowsecurity = true
    ) THEN
        ALTER TABLE grn_discrepancies ENABLE ROW LEVEL SECURITY;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = 'grn_attachments' AND relrowsecurity = true
    ) THEN
        ALTER TABLE grn_attachments ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- 13. Create RLS policies - with IF NOT EXISTS
DO $$
BEGIN
    -- grn_master policies
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'grn_master' AND policyname = 'Authenticated users can view all GRN records'
    ) THEN
        CREATE POLICY "Authenticated users can view all GRN records" 
        ON grn_master FOR SELECT 
        USING (true);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'grn_master' AND policyname = 'Authenticated users can manage GRN records'
    ) THEN
        CREATE POLICY "Authenticated users can manage GRN records" 
        ON grn_master FOR ALL 
        USING (true);
    END IF;
    
    -- grn_items policies
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'grn_items' AND policyname = 'Authenticated users can view all GRN items'
    ) THEN
        CREATE POLICY "Authenticated users can view all GRN items" 
        ON grn_items FOR SELECT 
        USING (true);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'grn_items' AND policyname = 'Authenticated users can manage GRN items'
    ) THEN
        CREATE POLICY "Authenticated users can manage GRN items" 
        ON grn_items FOR ALL 
        USING (true);
    END IF;
    
    -- grn_quality_inspections policies
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'grn_quality_inspections' AND policyname = 'Authenticated users can view all quality inspections'
    ) THEN
        CREATE POLICY "Authenticated users can view all quality inspections" 
        ON grn_quality_inspections FOR SELECT 
        USING (true);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'grn_quality_inspections' AND policyname = 'Authenticated users can manage quality inspections'
    ) THEN
        CREATE POLICY "Authenticated users can manage quality inspections" 
        ON grn_quality_inspections FOR ALL 
        USING (true);
    END IF;
    
    -- grn_discrepancies policies
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'grn_discrepancies' AND policyname = 'Authenticated users can view all discrepancies'
    ) THEN
        CREATE POLICY "Authenticated users can view all discrepancies" 
        ON grn_discrepancies FOR SELECT 
        USING (true);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'grn_discrepancies' AND policyname = 'Authenticated users can manage discrepancies'
    ) THEN
        CREATE POLICY "Authenticated users can manage discrepancies" 
        ON grn_discrepancies FOR ALL 
        USING (true);
    END IF;
    
    -- grn_attachments policies
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'grn_attachments' AND policyname = 'Authenticated users can view all attachments'
    ) THEN
        CREATE POLICY "Authenticated users can view all attachments" 
        ON grn_attachments FOR SELECT 
        USING (true);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'grn_attachments' AND policyname = 'Authenticated users can manage attachments'
    ) THEN
        CREATE POLICY "Authenticated users can manage attachments" 
        ON grn_attachments FOR ALL 
        USING (true);
    END IF;
END $$;

-- 14. Add comments for documentation
COMMENT ON TABLE grn_master IS 'Master table for Goods Receipt Notes - tracks the receipt of goods from suppliers';
COMMENT ON TABLE grn_items IS 'Line items for GRN - details of each item received';
COMMENT ON TABLE grn_quality_inspections IS 'Detailed quality inspection records for GRN items';
COMMENT ON TABLE grn_discrepancies IS 'Tracks discrepancies found during goods receipt';
COMMENT ON TABLE grn_attachments IS 'Supporting documents and attachments for GRN';

-- 15. Success message
SELECT 'GRN database schema created/updated successfully!' as status;
