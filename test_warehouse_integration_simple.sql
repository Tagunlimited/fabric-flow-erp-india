-- SIMPLE Test Warehouse Integration Setup
-- This script inserts sample data WITHOUT ON CONFLICT clauses to avoid constraint issues
-- Run this in your Supabase SQL Editor

-- Step 1: Insert supplier (simple insert, no conflict handling)
INSERT INTO supplier_master (id, supplier_code, supplier_name, enabled)
VALUES (gen_random_uuid(), 'SUP001', 'Test Supplier', true);

-- Step 2: Insert fabric (simple insert, no conflict handling)
INSERT INTO fabric_master (id, fabric_name, fabric_code, fabric_description, uom, rate, gst, hsn_code, inventory, status)
VALUES (gen_random_uuid(), 'Test Fabric', 'TF001', 'Sample fabric for testing', 'meters', 100.00, 5.0, '5208.11', 0, 'active');

-- Step 3: Insert item (simple insert, no conflict handling)
INSERT INTO item_master (id, item_name, item_code, item_type, description, uom, cost_price, gst_rate, min_stock_level, is_active)
VALUES (gen_random_uuid(), 'Test Item', 'TI001', 'ITEM', 'Sample item for testing', 'Pcs', 50.00, 12.0, 50, true);

-- Step 4: Insert sample GRN (try both possible table names)
-- First try goods_receipt_notes
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'goods_receipt_notes') THEN
        INSERT INTO goods_receipt_notes (id, grn_number, po_id, supplier_id, received_date, status, created_by, notes)
        SELECT 
            gen_random_uuid(),
            'GRN-TEST-001',
            NULL,
            sm.id,
            NOW(),
            'received',
            '00000000-0000-0000-0000-000000000000',
            'Sample GRN for warehouse inventory testing'
        FROM supplier_master sm
        WHERE sm.supplier_code = 'SUP001';
        RAISE NOTICE 'Inserted into goods_receipt_notes table';
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'grn_master') THEN
        INSERT INTO grn_master (id, grn_number, po_id, supplier_id, grn_date, received_date, status, created_by, notes)
        SELECT 
            gen_random_uuid(),
            'GRN-TEST-001',
            NULL,
            sm.id,
            CURRENT_DATE,
            NOW(),
            'received',
            '00000000-0000-0000-0000-000000000000',
            'Sample GRN for warehouse inventory testing'
        FROM supplier_master sm
        WHERE sm.supplier_code = 'SUP001';
        RAISE NOTICE 'Inserted into grn_master table';
    ELSE
        RAISE NOTICE 'Neither goods_receipt_notes nor grn_master table exists';
    END IF;
END $$;

-- Step 5: Insert GRN items (try both possible table names)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'goods_receipt_notes') THEN
        -- Insert fabric item
        INSERT INTO grn_items (id, grn_id, po_item_id, item_type, item_id, item_name, ordered_quantity, received_quantity, approved_quantity, rejected_quantity, unit_of_measure, unit_price, line_total, gst_rate, quality_status)
        SELECT 
            gen_random_uuid(),
            grn.id,
            NULL,
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
        WHERE grn.grn_number = 'GRN-TEST-001' AND fm.fabric_code = 'TF001';
        
        -- Insert item
        INSERT INTO grn_items (id, grn_id, po_item_id, item_type, item_id, item_name, ordered_quantity, received_quantity, approved_quantity, rejected_quantity, unit_of_measure, unit_price, line_total, gst_rate, quality_status)
        SELECT 
            gen_random_uuid(),
            grn.id,
            NULL,
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
        WHERE grn.grn_number = 'GRN-TEST-001' AND im.item_code = 'TI001';
        
        RAISE NOTICE 'Inserted GRN items into grn_items table';
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'grn_master') THEN
        -- Insert fabric item
        INSERT INTO grn_items (id, grn_id, po_item_id, item_type, item_id, item_name, ordered_quantity, received_quantity, approved_quantity, rejected_quantity, unit_of_measure, unit_price, line_total, gst_rate, quality_status)
        SELECT 
            gen_random_uuid(),
            grn.id,
            NULL,
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
        FROM grn_master grn, fabric_master fm
        WHERE grn.grn_number = 'GRN-TEST-001' AND fm.fabric_code = 'TF001';
        
        -- Insert item
        INSERT INTO grn_items (id, grn_id, po_item_id, item_type, item_id, item_name, ordered_quantity, received_quantity, approved_quantity, rejected_quantity, unit_of_measure, unit_price, line_total, gst_rate, quality_status)
        SELECT 
            gen_random_uuid(),
            grn.id,
            NULL,
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
        FROM grn_master grn, item_master im
        WHERE grn.grn_number = 'GRN-TEST-001' AND im.item_code = 'TI001';
        
        RAISE NOTICE 'Inserted GRN items into grn_items table (using grn_master)';
    ELSE
        RAISE NOTICE 'Neither goods_receipt_notes nor grn_master table exists';
    END IF;
END $$;

-- Step 6: Insert warehouse inventory (if warehouse_inventory table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'warehouse_inventory') THEN
        -- Try with goods_receipt_notes first
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'goods_receipt_notes') THEN
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
                COALESCE(fm.fabric_code, im.item_code, 'UNKNOWN'),
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
            AND gi.quality_status = 'approved';
        -- Try with grn_master
        ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'grn_master') THEN
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
                COALESCE(fm.fabric_code, im.item_code, 'UNKNOWN'),
                gi.approved_quantity,
                gi.unit_of_measure,
                b.id,
                'RECEIVED'::inventory_status,
                'Test data for warehouse integration'
            FROM grn_master grn
            JOIN grn_items gi ON grn.id = gi.grn_id
            LEFT JOIN fabric_master fm ON gi.item_id = fm.id AND gi.item_type = 'fabric'
            LEFT JOIN item_master im ON gi.item_id = im.id AND gi.item_type = 'item'
            CROSS JOIN (
                SELECT id FROM bins 
                WHERE location_type = 'RECEIVING_ZONE' 
                LIMIT 1
            ) b
            WHERE grn.grn_number = 'GRN-TEST-001'
            AND gi.quality_status = 'approved';
        END IF;
        
        RAISE NOTICE 'Warehouse inventory data inserted successfully';
    ELSE
        RAISE NOTICE 'warehouse_inventory table does not exist - skipping inventory insertion';
    END IF;
END $$;

-- Step 7: Verification queries
SELECT 'Test data insertion completed successfully!' as status;

-- Check what tables exist
SELECT 'Existing Tables:' as info;
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('supplier_master', 'fabric_master', 'item_master', 'goods_receipt_notes', 'grn_master', 'grn_items', 'warehouse_inventory', 'bins')
ORDER BY table_name;

-- Check data counts
SELECT 'Data Counts:' as info;
SELECT 'Suppliers' as type, COUNT(*) as count FROM supplier_master WHERE supplier_code = 'SUP001'
UNION ALL
SELECT 'Fabrics' as type, COUNT(*) as count FROM fabric_master WHERE fabric_code = 'TF001'
UNION ALL
SELECT 'Items' as type, COUNT(*) as count FROM item_master WHERE item_code = 'TI001'
UNION ALL
SELECT 'GRN (goods_receipt_notes)' as type, COUNT(*) as count FROM goods_receipt_notes WHERE grn_number = 'GRN-TEST-001'
UNION ALL
SELECT 'GRN (grn_master)' as type, COUNT(*) as count FROM grn_master WHERE grn_number = 'GRN-TEST-001'
UNION ALL
SELECT 'GRN Items' as type, COUNT(*) as count FROM grn_items gi 
JOIN (SELECT id FROM goods_receipt_notes WHERE grn_number = 'GRN-TEST-001' UNION SELECT id FROM grn_master WHERE grn_number = 'GRN-TEST-001') grn ON gi.grn_id = grn.id
UNION ALL
SELECT 'Warehouse Inventory' as type, COUNT(*) as count FROM warehouse_inventory wi 
JOIN (SELECT id FROM goods_receipt_notes WHERE grn_number = 'GRN-TEST-001' UNION SELECT id FROM grn_master WHERE grn_number = 'GRN-TEST-001') grn ON wi.grn_id = grn.id
UNION ALL
SELECT 'Receiving Zone Bins' as type, COUNT(*) as count FROM bins WHERE location_type = 'RECEIVING_ZONE';
