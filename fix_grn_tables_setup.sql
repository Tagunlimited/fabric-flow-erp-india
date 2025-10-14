-- Fix GRN Tables Setup
-- This script ensures the GRN tables are properly created with the correct schema

-- 1. Drop existing goods_receipt_notes table if it exists (old schema)
DROP TABLE IF EXISTS goods_receipt_notes CASCADE;

-- 2. Create grn_master table (Header) with proper schema
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

-- 3. Create grn_items table (Line Items)
CREATE TABLE IF NOT EXISTS grn_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    grn_id UUID NOT NULL REFERENCES grn_master(id) ON DELETE CASCADE,
    po_item_id UUID NOT NULL, -- Reference to purchase_order_items
    item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('fabric', 'item', 'product')),
    item_id UUID, -- Made nullable to allow items not in master tables
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
    -- Additional fields for fabric details
    fabric_name TEXT,
    fabric_color TEXT,
    fabric_gsm TEXT,
    item_color TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_grn_master_po_id ON grn_master(po_id);
CREATE INDEX IF NOT EXISTS idx_grn_master_supplier_id ON grn_master(supplier_id);
CREATE INDEX IF NOT EXISTS idx_grn_master_status ON grn_master(status);
CREATE INDEX IF NOT EXISTS idx_grn_master_grn_number ON grn_master(grn_number);
CREATE INDEX IF NOT EXISTS idx_grn_items_grn_id ON grn_items(grn_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_item_type ON grn_items(item_type);
CREATE INDEX IF NOT EXISTS idx_grn_items_quality_status ON grn_items(quality_status);

-- 5. Enable RLS
ALTER TABLE grn_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_items ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies
DROP POLICY IF EXISTS "Authenticated users can view grn_master" ON grn_master;
DROP POLICY IF EXISTS "Authenticated users can manage grn_master" ON grn_master;
DROP POLICY IF EXISTS "Authenticated users can view grn_items" ON grn_items;
DROP POLICY IF EXISTS "Authenticated users can manage grn_items" ON grn_items;

CREATE POLICY "Authenticated users can view grn_master"
  ON grn_master
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage grn_master"
  ON grn_master
  FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view grn_items"
  ON grn_items
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage grn_items"
  ON grn_items
  FOR ALL
  TO authenticated
  USING (true);

-- 7. Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_grn_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Create triggers
DROP TRIGGER IF EXISTS update_grn_master_updated_at ON grn_master;
DROP TRIGGER IF EXISTS update_grn_items_updated_at ON grn_items;

CREATE TRIGGER update_grn_master_updated_at
  BEFORE UPDATE ON grn_master
  FOR EACH ROW
  EXECUTE FUNCTION update_grn_updated_at();

CREATE TRIGGER update_grn_items_updated_at
  BEFORE UPDATE ON grn_items
  FOR EACH ROW
  EXECUTE FUNCTION update_grn_updated_at();

-- 9. Create function to generate GRN numbers
CREATE OR REPLACE FUNCTION generate_grn_number()
RETURNS TRIGGER AS $$
DECLARE
    next_number INTEGER;
    formatted_number TEXT;
BEGIN
    -- Get the next sequential number
    SELECT COALESCE(MAX(CAST(SUBSTRING(grn_number FROM 'GRN-(\d+)') AS INTEGER)), 0) + 1
    INTO next_number
    FROM grn_master
    WHERE grn_number ~ '^GRN-\d+$';
    
    -- Format as GRN-XXXXXXXXXX
    formatted_number := 'GRN-' || LPAD(next_number::TEXT, 10, '0');
    
    NEW.grn_number := formatted_number;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. Create trigger for auto-generating GRN numbers
DROP TRIGGER IF EXISTS generate_grn_number_trigger ON grn_master;

CREATE TRIGGER generate_grn_number_trigger
  BEFORE INSERT ON grn_master
  FOR EACH ROW
  WHEN (NEW.grn_number IS NULL OR NEW.grn_number = '')
  EXECUTE FUNCTION generate_grn_number();

-- 11. Add comments for documentation
COMMENT ON TABLE grn_master IS 'Goods Receipt Note master table - tracks GRN headers';
COMMENT ON TABLE grn_items IS 'Goods Receipt Note items table - tracks individual items in GRN';

COMMENT ON COLUMN grn_master.status IS 'GRN status: draft, received, under_inspection, approved, rejected, partially_approved';
COMMENT ON COLUMN grn_items.item_id IS 'Reference to fabric_master or item_master table (nullable for custom items)';
COMMENT ON COLUMN grn_items.quality_status IS 'Item quality status: pending, approved, rejected, damaged';

-- 12. Create a view for easy querying of GRN data with related information
CREATE OR REPLACE VIEW grn_with_details AS
SELECT 
  gm.*,
  po.po_number,
  sm.supplier_name,
  sm.primary_contact_name as supplier_contact,
  sm.primary_contact_phone as supplier_phone,
  sm.primary_contact_email as supplier_email,
  sm.billing_address_line1 as supplier_address
FROM grn_master gm
LEFT JOIN purchase_orders po ON gm.po_id = po.id
LEFT JOIN supplier_master sm ON gm.supplier_id = sm.id;

-- 13. Create RLS policy for the view
CREATE POLICY "Authenticated users can view grn_with_details"
  ON grn_with_details
  FOR SELECT
  TO authenticated
  USING (true);

-- Success message
SELECT 'GRN tables setup completed successfully!' as status;
