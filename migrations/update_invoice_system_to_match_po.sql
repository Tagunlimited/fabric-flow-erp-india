-- Update Invoice System to Match Purchase Order Format
-- This migration adds price, GST, and item management fields to match PO system

-- Step 1: Update invoice_items table to match purchase_order_items structure
ALTER TABLE invoice_items 
-- Add missing fields (unit_price and total_price already exist)
ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS gst_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) DEFAULT 'product',
ADD COLUMN IF NOT EXISTS item_id UUID,
ADD COLUMN IF NOT EXISTS item_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS item_image_url TEXT,
ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(20) DEFAULT 'pcs',
ADD COLUMN IF NOT EXISTS remarks TEXT,
ADD COLUMN IF NOT EXISTS attributes JSONB,
-- Fabric-specific fields (matching PO structure)
ADD COLUMN IF NOT EXISTS fabric_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS fabric_color VARCHAR(100),
ADD COLUMN IF NOT EXISTS fabric_gsm VARCHAR(50),
ADD COLUMN IF NOT EXISTS item_category VARCHAR(255);

-- Step 2: Update invoices table to match purchase_orders structure
-- Most fields already exist, only add missing ones
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS delivery_address TEXT,
ADD COLUMN IF NOT EXISTS terms_conditions TEXT;

-- Step 3: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_item_type ON invoice_items(item_type);
CREATE INDEX IF NOT EXISTS idx_invoice_items_item_id ON invoice_items(item_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);

-- Step 4: Update existing records with default values
UPDATE invoice_items 
SET 
    unit_price = COALESCE(unit_price, 0),
    total_price = COALESCE(total_price, 0),
    gst_rate = COALESCE(gst_rate, 0),
    gst_amount = COALESCE(gst_amount, 0),
    item_type = COALESCE(item_type, 'product'),
    unit_of_measure = COALESCE(unit_of_measure, 'pcs')
WHERE unit_price IS NULL OR total_price IS NULL OR gst_rate IS NULL;

UPDATE invoices 
SET 
    invoice_date = COALESCE(invoice_date, CURRENT_DATE),
    status = COALESCE(status, 'draft'),
    updated_at = NOW()
WHERE invoice_date IS NULL OR status IS NULL;

-- Step 5: Create trigger for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_invoice_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;

-- Create trigger for invoices
CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_invoice_updated_at();

-- Step 6: Add constraints to ensure data integrity
-- Drop existing constraints if they exist, then add new ones
DO $$ 
BEGIN
    -- Drop existing constraints for invoice_items
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoice_items_unit_price') THEN
        ALTER TABLE invoice_items DROP CONSTRAINT chk_invoice_items_unit_price;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoice_items_total_price') THEN
        ALTER TABLE invoice_items DROP CONSTRAINT chk_invoice_items_total_price;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoice_items_gst_rate') THEN
        ALTER TABLE invoice_items DROP CONSTRAINT chk_invoice_items_gst_rate;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoice_items_gst_amount') THEN
        ALTER TABLE invoice_items DROP CONSTRAINT chk_invoice_items_gst_amount;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoice_items_quantity') THEN
        ALTER TABLE invoice_items DROP CONSTRAINT chk_invoice_items_quantity;
    END IF;
    
    -- Drop existing constraints for invoices
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoices_subtotal') THEN
        ALTER TABLE invoices DROP CONSTRAINT chk_invoices_subtotal;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoices_tax_amount') THEN
        ALTER TABLE invoices DROP CONSTRAINT chk_invoices_tax_amount;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoices_total_amount') THEN
        ALTER TABLE invoices DROP CONSTRAINT chk_invoices_total_amount;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoices_paid_amount') THEN
        ALTER TABLE invoices DROP CONSTRAINT chk_invoices_paid_amount;
    END IF;
END $$;

-- Add new constraints for invoice_items
ALTER TABLE invoice_items 
ADD CONSTRAINT chk_invoice_items_unit_price CHECK (unit_price >= 0),
ADD CONSTRAINT chk_invoice_items_total_price CHECK (total_price >= 0),
ADD CONSTRAINT chk_invoice_items_gst_rate CHECK (gst_rate >= 0 AND gst_rate <= 100),
ADD CONSTRAINT chk_invoice_items_gst_amount CHECK (gst_amount >= 0),
ADD CONSTRAINT chk_invoice_items_quantity CHECK (quantity > 0);

-- Add new constraints for invoices
ALTER TABLE invoices 
ADD CONSTRAINT chk_invoices_subtotal CHECK (subtotal >= 0),
ADD CONSTRAINT chk_invoices_tax_amount CHECK (tax_amount >= 0),
ADD CONSTRAINT chk_invoices_total_amount CHECK (total_amount >= 0),
ADD CONSTRAINT chk_invoices_paid_amount CHECK (paid_amount >= 0);

-- Step 7: Create view for invoice items with all details (similar to PO view)
CREATE OR REPLACE VIEW invoice_items_with_details AS
SELECT 
    ii.id,
    ii.invoice_id,
    ii.item_type,
    ii.item_id,
    COALESCE(ii.item_name, ii.description) as item_name,  -- Use description as fallback
    ii.item_image_url,
    ii.quantity,
    ii.unit_price,
    ii.total_price,
    ii.gst_rate,
    ii.gst_amount,
    ii.unit_of_measure,
    ii.remarks,
    ii.attributes,
    ii.fabric_name,
    ii.fabric_color,
    ii.fabric_gsm,
    ii.item_category,
    ii.created_at,
    -- Invoice details
    i.invoice_number,
    i.invoice_date,
    i.customer_id,
    i.status as invoice_status,
    -- Customer details
    c.company_name as customer_name,
    c.contact_person,
    c.email as customer_email,
    c.phone as customer_phone,
    c.address as customer_address,
    c.city as customer_city,
    c.state as customer_state,
    c.pincode as customer_pincode,
    c.gstin as customer_gstin
FROM invoice_items ii
JOIN invoices i ON ii.invoice_id = i.id
LEFT JOIN customers c ON i.customer_id = c.id;

-- Step 8: Enable RLS policies for invoice_items
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

-- Create policies for invoice_items
-- Drop existing policies if they exist, then create new ones
DO $$ 
BEGIN
    -- Drop existing policies for invoice_items
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invoice_items' AND policyname = 'Allow users to view invoice items') THEN
        DROP POLICY "Allow users to view invoice items" ON invoice_items;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invoice_items' AND policyname = 'Allow users to manage invoice items') THEN
        DROP POLICY "Allow users to manage invoice items" ON invoice_items;
    END IF;
END $$;

-- Create new policies for invoice_items
CREATE POLICY "Allow users to view invoice items"
ON invoice_items FOR SELECT
USING (true);

CREATE POLICY "Allow users to manage invoice items"
ON invoice_items FOR ALL
USING (true);

-- Step 9: Create function to calculate invoice totals
CREATE OR REPLACE FUNCTION calculate_invoice_totals(invoice_uuid UUID)
RETURNS TABLE (
    subtotal DECIMAL(15,2),
    total_gst DECIMAL(15,2),
    total_amount DECIMAL(15,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(ii.total_price), 0) as subtotal,
        COALESCE(SUM(ii.gst_amount), 0) as total_gst,
        COALESCE(SUM(ii.total_price + ii.gst_amount), 0) as total_amount
    FROM invoice_items ii
    WHERE ii.invoice_id = invoice_uuid;
END;
$$ LANGUAGE plpgsql;

-- Step 10: Create trigger to auto-update invoice totals when items change
CREATE OR REPLACE FUNCTION update_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
    totals RECORD;
BEGIN
    -- Calculate totals for the affected invoice
    SELECT * INTO totals FROM calculate_invoice_totals(
        COALESCE(NEW.invoice_id, OLD.invoice_id)
    );
    
    -- Update the invoice with new totals
    UPDATE invoices 
    SET 
        subtotal = totals.subtotal,
        tax_amount = totals.total_gst,
        total_amount = totals.total_amount,
        updated_at = NOW()
    WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers for invoice_items
DROP TRIGGER IF EXISTS trg_update_invoice_totals_insert ON invoice_items;
DROP TRIGGER IF EXISTS trg_update_invoice_totals_update ON invoice_items;
DROP TRIGGER IF EXISTS trg_update_invoice_totals_delete ON invoice_items;

CREATE TRIGGER trg_update_invoice_totals_insert
    AFTER INSERT ON invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION update_invoice_totals();

CREATE TRIGGER trg_update_invoice_totals_update
    AFTER UPDATE ON invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION update_invoice_totals();

CREATE TRIGGER trg_update_invoice_totals_delete
    AFTER DELETE ON invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION update_invoice_totals();

-- Step 11: Verify the migration
SELECT 
    'Migration Verification' as check_type,
    'Invoice items table updated with price and GST fields' as status;

-- Check if new columns exist
SELECT 
    'New Columns Check' as check_type,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'invoice_items' 
  AND column_name IN ('unit_price', 'total_price', 'gst_rate', 'gst_amount', 'item_type', 'item_image_url')
ORDER BY column_name;

-- Check if indexes were created
SELECT 
    'Indexes Check' as check_type,
    indexname,
    tablename
FROM pg_indexes 
WHERE tablename IN ('invoice_items', 'invoices')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Success message
SELECT 'Invoice system successfully updated to match Purchase Order format!' as result;
