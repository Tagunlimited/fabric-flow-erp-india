-- Product Parts and Customization System Database Schema
-- Run this in Supabase SQL Editor

-- Step 1: Create product_parts table
CREATE TABLE IF NOT EXISTS product_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_name VARCHAR(100) NOT NULL UNIQUE,
    part_type VARCHAR(50) NOT NULL CHECK (part_type IN ('dropdown', 'number')),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Create product_category_parts linking table (many-to-many)
CREATE TABLE IF NOT EXISTS product_category_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_category_id UUID REFERENCES product_categories(id) ON DELETE CASCADE,
    part_id UUID REFERENCES product_parts(id) ON DELETE CASCADE,
    is_required BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_category_id, part_id)
);

-- Step 3: Create part_addons table for dropdown options
CREATE TABLE IF NOT EXISTS part_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_id UUID REFERENCES product_parts(id) ON DELETE CASCADE,
    addon_name VARCHAR(100) NOT NULL,
    addon_value VARCHAR(100),
    price_adjustment DECIMAL(10,2) DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 4: Create order_item_customizations table to store user selections
CREATE TABLE IF NOT EXISTS order_item_customizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id UUID REFERENCES order_items(id) ON DELETE CASCADE,
    part_id UUID REFERENCES product_parts(id) ON DELETE CASCADE,
    selected_addon_id UUID REFERENCES part_addons(id), -- For dropdown parts
    custom_value VARCHAR(100), -- For number input parts
    quantity INTEGER DEFAULT 1, -- For number parts
    price_impact DECIMAL(10,2) DEFAULT 0, -- Calculated price impact
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 5: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_product_parts_name ON product_parts(part_name);
CREATE INDEX IF NOT EXISTS idx_product_parts_type ON product_parts(part_type);
CREATE INDEX IF NOT EXISTS idx_product_category_parts_category ON product_category_parts(product_category_id);
CREATE INDEX IF NOT EXISTS idx_product_category_parts_part ON product_category_parts(part_id);
CREATE INDEX IF NOT EXISTS idx_part_addons_part ON part_addons(part_id);
CREATE INDEX IF NOT EXISTS idx_order_item_customizations_item ON order_item_customizations(order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_item_customizations_part ON order_item_customizations(part_id);

-- Step 6: Enable Row Level Security
ALTER TABLE product_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_category_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE part_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_customizations ENABLE ROW LEVEL SECURITY;

-- Step 7: Create RLS policies
-- Product Parts policies
CREATE POLICY "Users can view product parts" ON product_parts
    FOR SELECT USING (true);

CREATE POLICY "Users can insert product parts" ON product_parts
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update product parts" ON product_parts
    FOR UPDATE USING (true);

CREATE POLICY "Users can delete product parts" ON product_parts
    FOR DELETE USING (true);

-- Product Category Parts policies
CREATE POLICY "Users can view product category parts" ON product_category_parts
    FOR SELECT USING (true);

CREATE POLICY "Users can insert product category parts" ON product_category_parts
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update product category parts" ON product_category_parts
    FOR UPDATE USING (true);

CREATE POLICY "Users can delete product category parts" ON product_category_parts
    FOR DELETE USING (true);

-- Part Addons policies
CREATE POLICY "Users can view part addons" ON part_addons
    FOR SELECT USING (true);

CREATE POLICY "Users can insert part addons" ON part_addons
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update part addons" ON part_addons
    FOR UPDATE USING (true);

CREATE POLICY "Users can delete part addons" ON part_addons
    FOR DELETE USING (true);

-- Order Item Customizations policies
CREATE POLICY "Users can view order item customizations" ON order_item_customizations
    FOR SELECT USING (true);

CREATE POLICY "Users can insert order item customizations" ON order_item_customizations
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update order item customizations" ON order_item_customizations
    FOR UPDATE USING (true);

CREATE POLICY "Users can delete order item customizations" ON order_item_customizations
    FOR DELETE USING (true);

-- Step 8: Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_product_parts_updated_at 
    BEFORE UPDATE ON product_parts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_part_addons_updated_at 
    BEFORE UPDATE ON part_addons 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Step 9: Insert some sample data
INSERT INTO product_parts (part_name, part_type, description) VALUES
('Sleeve Length', 'dropdown', 'Choose sleeve length for the garment'),
('Number of Buttons', 'number', 'Specify number of buttons required'),
('Collar Style', 'dropdown', 'Select collar style'),
('Pocket Type', 'dropdown', 'Choose pocket configuration'),
('Fabric Weight', 'number', 'Specify fabric weight in GSM');

-- Insert sample addons for dropdown parts
INSERT INTO part_addons (part_id, addon_name, addon_value, price_adjustment, sort_order) 
SELECT 
    pp.id,
    addon_data.addon_name,
    addon_data.addon_value,
    addon_data.price_adjustment,
    addon_data.sort_order
FROM product_parts pp
CROSS JOIN (
    VALUES 
        ('Sleeve Length', 'Short Sleeve', 'short', 0, 1),
        ('Sleeve Length', 'Long Sleeve', 'long', 50, 2),
        ('Sleeve Length', 'No Sleeve', 'none', -20, 3),
        ('Collar Style', 'Round Neck', 'round', 0, 1),
        ('Collar Style', 'V Neck', 'v-neck', 30, 2),
        ('Collar Style', 'Polo Collar', 'polo', 100, 3),
        ('Pocket Type', 'No Pockets', 'none', 0, 1),
        ('Pocket Type', 'Chest Pocket', 'chest', 80, 2),
        ('Pocket Type', 'Side Pockets', 'side', 150, 3)
) AS addon_data(part_name, addon_name, addon_value, price_adjustment, sort_order)
WHERE pp.part_name = addon_data.part_name;

-- Add comments
COMMENT ON TABLE product_parts IS 'Product parts that can be customized (e.g., Sleeve Length, Number of Buttons)';
COMMENT ON TABLE product_category_parts IS 'Links product categories to available parts for customization';
COMMENT ON TABLE part_addons IS 'Available options for dropdown-type parts';
COMMENT ON TABLE order_item_customizations IS 'Stores user-selected customizations for order items';

-- Success message
SELECT 'Product parts and customization system created successfully!' as status;
