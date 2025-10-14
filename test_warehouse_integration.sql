-- Test Warehouse Integration Setup
-- This script inserts sample data into goods_receipt_notes and grn_items
-- to allow testing of the warehouse inventory auto-placement feature.

-- Ensure a supplier exists (using basic columns that should exist)
INSERT INTO supplier_master (id, supplier_code, supplier_name, enabled)
VALUES (gen_random_uuid(), 'SUP001', 'Test Supplier', true)
ON CONFLICT (supplier_code) DO NOTHING;

-- Ensure a fabric item exists
INSERT INTO fabric_master (id, fabric_name, fabric_code, fabric_description, uom, rate, gst, hsn_code, inventory, status)
VALUES (gen_random_uuid(), 'Test Fabric', 'TF001', 'Sample fabric for testing', 'meters', 100.00, 5.0, '5208.11', 0, 'active')
ON CONFLICT (fabric_code) DO NOTHING;

-- Ensure an item exists
INSERT INTO item_master (id, item_name, item_code, description, uom, cost_price, gst_rate, min_stock_level, is_active, item_type)
VALUES (gen_random_uuid(), 'Test Item', 'TI001', 'Sample item for testing', 'Pcs', 50.00, 12.0, 50, true, 'ITEM')
ON CONFLICT (item_code) DO NOTHING;

-- Insert a sample GRN
INSERT INTO goods_receipt_notes (id, grn_number, po_id, supplier_id, received_date, status, created_by, notes)
SELECT 
    gen_random_uuid(),
    'GRN-TEST-001',
    NULL, -- No PO linked for simplicity
    sm.id,
    NOW(),
    'received', -- Initial status
    '00000000-0000-0000-0000-000000000000', -- Placeholder user ID
    'Sample GRN for warehouse inventory testing'
FROM supplier_master sm
WHERE sm.supplier_code = 'SUP001'
ON CONFLICT (grn_number) DO NOTHING;

-- Insert sample GRN items
INSERT INTO grn_items (id, grn_id, po_item_id, item_type, item_id, item_name, ordered_quantity, received_quantity, approved_quantity, rejected_quantity, unit_of_measure, unit_price, line_total, gst_rate, quality_status)
SELECT 
    gen_random_uuid(),
    grn.id,
    NULL, -- No PO item linked
    'fabric',
    fm.id,
    fm.fabric_name,
    100.0,
    100.0,
    100.0,
    0.0,
    fm.uom,
    fm.rate,
    100.0 * fm.rate,
    fm.gst,
    'approved'
FROM goods_receipt_notes grn, fabric_master fm
WHERE grn.grn_number = 'GRN-TEST-001' AND fm.fabric_code = 'TF001'
ON CONFLICT (grn_id, item_id) DO NOTHING;

INSERT INTO grn_items (id, grn_id, po_item_id, item_type, item_id, item_name, ordered_quantity, received_quantity, approved_quantity, rejected_quantity, unit_of_measure, unit_price, line_total, gst_rate, quality_status)
SELECT 
    gen_random_uuid(),
    grn.id,
    NULL, -- No PO item linked
    'item',
    im.id,
    im.item_name,
    50.0,
    50.0,
    50.0,
    0.0,
    im.uom,
    im.cost_price,
    50.0 * im.cost_price,
    im.gst_rate,
    'approved'
FROM goods_receipt_notes grn, item_master im
WHERE grn.grn_number = 'GRN-TEST-001' AND im.item_code = 'TI001'
ON CONFLICT (grn_id, item_id) DO NOTHING;

-- Now manually insert warehouse inventory for testing
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
            COALESCE(fm.fabric_code, im.item_code, 'UNKNOWN'), -- Get item_code from source tables
            gi.approved_quantity,
            gi.unit_of_measure,
            b.id,
            'RECEIVED'::inventory_status,
            'Test data for warehouse integration'
        FROM goods_receipt_notes grn
        JOIN grn_items gi ON grn.id = gi.grn_id
        LEFT JOIN fabric_master fm ON gi.item_id = fm.id AND gi.item_type = 'fabric'
        LEFT JOIN item_master im ON gi.item_id = im.id AND gi.item_type = 'item'
        CROSS JOIN (
            SELECT id FROM bins 
            WHERE location_type = 'RECEIVING_ZONE' 
            LIMIT 1
        ) b
        WHERE grn.grn_number = 'GRN-TEST-001'
        AND gi.quality_status = 'approved'
        ON CONFLICT DO NOTHING;

-- Verification queries
SELECT 'Test GRN and items inserted successfully' as status;

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