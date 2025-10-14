-- Test Warehouse Integration Setup - Safe Version
-- This script checks table structures and inserts sample data accordingly

-- First, let's check what columns exist in supplier_master
SELECT 'Checking supplier_master columns...' as status;

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'supplier_master' 
ORDER BY ordinal_position;

-- Insert supplier with only basic columns that should exist
INSERT INTO supplier_master (id, supplier_code, supplier_name, enabled)
VALUES (gen_random_uuid(), 'SUP001', 'Test Supplier', true)
ON CONFLICT (supplier_code) DO NOTHING;

-- Check fabric_master columns
SELECT 'Checking fabric_master columns...' as status;

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'fabric_master' 
ORDER BY ordinal_position;

-- Insert fabric with basic columns
INSERT INTO fabric_master (id, fabric_name, fabric_code, uom, rate, inventory, status)
VALUES (gen_random_uuid(), 'Test Fabric', 'TF001', 'meters', 100.00, 0, 'active')
ON CONFLICT (fabric_code) DO NOTHING;

-- Check item_master columns
SELECT 'Checking item_master columns...' as status;

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'item_master' 
ORDER BY ordinal_position;

-- Insert item with basic columns
INSERT INTO item_master (id, item_name, item_code, uom, is_active, item_type)
VALUES (gen_random_uuid(), 'Test Item', 'TI001', 'Pcs', true, 'ITEM')
ON CONFLICT (item_code) DO NOTHING;

-- Insert a sample GRN
INSERT INTO goods_receipt_notes (id, grn_number, supplier_id, received_date, status, notes)
SELECT 
    gen_random_uuid(),
    'GRN-TEST-001',
    sm.id,
    NOW(),
    'received',
    'Sample GRN for warehouse inventory testing'
FROM supplier_master sm
WHERE sm.supplier_code = 'SUP001'
ON CONFLICT (grn_number) DO NOTHING;

-- Insert sample GRN items for fabric
INSERT INTO grn_items (id, grn_id, item_type, item_id, item_name, item_code, ordered_quantity, received_quantity, approved_quantity, unit_of_measure, unit_price, line_total, quality_status)
SELECT 
    gen_random_uuid(),
    grn.id,
    'fabric',
    fm.id,
    fm.fabric_name,
    fm.fabric_code,
    100.0,
    100.0,
    100.0,
    fm.uom,
    fm.rate,
    100.0 * fm.rate,
    'approved'
FROM goods_receipt_notes grn, fabric_master fm
WHERE grn.grn_number = 'GRN-TEST-001' AND fm.fabric_code = 'TF001'
ON CONFLICT (grn_id, item_id) DO NOTHING;

-- Insert sample GRN items for item
INSERT INTO grn_items (id, grn_id, item_type, item_id, item_name, item_code, ordered_quantity, received_quantity, approved_quantity, unit_of_measure, unit_price, line_total, quality_status)
SELECT 
    gen_random_uuid(),
    grn.id,
    'item',
    im.id,
    im.item_name,
    im.item_code,
    50.0,
    50.0,
    50.0,
    im.uom,
    50.0, -- Default price
    50.0 * 50.0,
    'approved'
FROM goods_receipt_notes grn, item_master im
WHERE grn.grn_number = 'GRN-TEST-001' AND im.item_code = 'TI001'
ON CONFLICT (grn_id, item_id) DO NOTHING;

-- Check if warehouse_inventory table exists and insert test data
SELECT 'Checking warehouse_inventory table...' as status;

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'warehouse_inventory' 
ORDER BY ordinal_position;

-- Insert warehouse inventory if table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'warehouse_inventory') THEN
        INSERT INTO warehouse_inventory (
            grn_id, 
            grn_item_id, 
            item_type, 
            item_id, 
            item_name, 
            item_code, 
            quantity, 
            unit, 
            bin_id, 
            status, 
            notes
        )
        SELECT 
            grn.id,
            gi.id,
            CASE 
                WHEN gi.item_type = 'fabric' THEN 'FABRIC'::warehouse_item_type
                WHEN gi.item_type = 'product' THEN 'PRODUCT'::warehouse_item_type
                ELSE 'ITEM'::warehouse_item_type
            END,
            gi.item_id,
            gi.item_name,
            gi.item_code,
            gi.approved_quantity,
            gi.unit_of_measure,
            b.id,
            'RECEIVED'::inventory_status,
            'Test data for warehouse integration'
        FROM goods_receipt_notes grn
        JOIN grn_items gi ON grn.id = gi.grn_id
        CROSS JOIN (
            SELECT id FROM bins 
            WHERE location_type = 'RECEIVING_ZONE' 
            LIMIT 1
        ) b
        WHERE grn.grn_number = 'GRN-TEST-001'
        AND gi.quality_status = 'approved'
        ON CONFLICT DO NOTHING;
        
        RAISE NOTICE 'Warehouse inventory data inserted successfully';
    ELSE
        RAISE NOTICE 'warehouse_inventory table does not exist - skipping inventory insertion';
    END IF;
END $$;

-- Final verification
SELECT 'Test data insertion completed' as status;

SELECT 
    'GRN Data' as type,
    COUNT(*) as count
FROM goods_receipt_notes 
WHERE grn_number = 'GRN-TEST-001'

UNION ALL

SELECT 
    'GRN Items' as type,
    COUNT(*) as count
FROM grn_items gi
JOIN goods_receipt_notes grn ON gi.grn_id = grn.id
WHERE grn.grn_number = 'GRN-TEST-001'

UNION ALL

SELECT 
    'Warehouse Inventory' as type,
    COUNT(*) as count
FROM warehouse_inventory wi
JOIN goods_receipt_notes grn ON wi.grn_id = grn.id
WHERE grn.grn_number = 'GRN-TEST-001'

UNION ALL

SELECT 
    'Receiving Zone Bins' as type,
    COUNT(*) as count
FROM bins 
WHERE location_type = 'RECEIVING_ZONE';
