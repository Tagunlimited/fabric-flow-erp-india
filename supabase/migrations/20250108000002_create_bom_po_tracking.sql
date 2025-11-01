-- Create BOM-PO tracking table
CREATE TABLE bom_po_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bom_id UUID REFERENCES bom_records(id) ON DELETE CASCADE,
  bom_item_id UUID REFERENCES bom_record_items(id) ON DELETE CASCADE,
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  po_item_id UUID REFERENCES purchase_order_items(id) ON DELETE CASCADE,
  ordered_quantity DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX idx_bom_po_items_bom_id ON bom_po_items(bom_id);
CREATE INDEX idx_bom_po_items_bom_item_id ON bom_po_items(bom_item_id);
CREATE INDEX idx_bom_po_items_po_id ON bom_po_items(po_id);

-- Create view to easily check remaining quantities
CREATE OR REPLACE VIEW bom_item_order_status AS
SELECT 
  br.id as bom_id,
  br.bom_number,
  bri.id as bom_item_id,
  bri.item_name,
  bri.qty_total as total_required,
  COALESCE(SUM(bpi.ordered_quantity), 0) as total_ordered,
  bri.qty_total - COALESCE(SUM(bpi.ordered_quantity), 0) as remaining_quantity
FROM bom_records br
JOIN bom_record_items bri ON br.id = bri.bom_id
LEFT JOIN bom_po_items bpi ON bri.id = bpi.bom_item_id
GROUP BY br.id, br.bom_number, bri.id, bri.item_name, bri.qty_total;

-- Enable RLS on the new table
ALTER TABLE bom_po_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for bom_po_items
CREATE POLICY "Enable read access for all users" ON bom_po_items
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON bom_po_items
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON bom_po_items
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users only" ON bom_po_items
    FOR DELETE USING (auth.role() = 'authenticated');

-- Grant necessary permissions
GRANT ALL ON bom_po_items TO postgres, anon, authenticated, service_role;
GRANT SELECT ON bom_item_order_status TO postgres, anon, authenticated, service_role;
