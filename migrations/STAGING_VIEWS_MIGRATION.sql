-- ============================================================================
-- CREATE VIEWS - Run After Tables Migration
-- Generated: October 8, 2025
-- Description: Creates all views for complex queries
-- ============================================================================

-- ============================================================================
-- 1. ORDER LIFECYCLE VIEW
-- ============================================================================
DROP VIEW IF EXISTS order_lifecycle_view CASCADE;
CREATE VIEW order_lifecycle_view AS
SELECT 
    o.id as order_id,
    o.order_number,
    o.status as current_status,
    o.created_at as order_created,
    po.created_at as production_started,
    qc.check_date as quality_checked,
    disp.dispatch_date as dispatched,
    CASE 
        WHEN o.status = 'pending' THEN 'Order Placed'
        WHEN o.status = 'in_production' THEN 'In Production'
        WHEN qc.status = 'passed' THEN 'Quality Checked'
        WHEN disp.status = 'delivered' THEN 'Delivered'
        ELSE 'In Progress'
    END as activity_type,
    CASE 
        WHEN o.status = 'pending' THEN o.created_at
        WHEN o.status = 'in_production' THEN po.created_at
        WHEN qc.status = 'passed' THEN qc.check_date::timestamptz
        WHEN disp.status = 'delivered' THEN disp.dispatch_date::timestamptz
        ELSE o.updated_at
    END as performed_at
FROM orders o
LEFT JOIN production_orders po ON o.id = po.order_id
LEFT JOIN quality_checks qc ON o.id = qc.order_id
LEFT JOIN dispatch_orders disp ON o.id = disp.order_id;

-- ============================================================================
-- 2. ORDER BATCH ASSIGNMENTS WITH DETAILS VIEW
-- ============================================================================
DROP VIEW IF EXISTS order_batch_assignments_with_details CASCADE;
CREATE VIEW order_batch_assignments_with_details AS
SELECT 
    oba.id as assignment_id,
    oba.order_id,
    oba.batch_id,
    oba.batch_name,
    oba.batch_leader_id,
    oba.batch_leader_name,
    oba.batch_leader_avatar,
    oba.status,
    oba.priority,
    oba.total_quantity,
    oba.completed_quantity,
    oba.assigned_date,
    oba.expected_completion_date,
    oba.actual_completion_date,
    oba.notes,
    o.order_number,
    o.customer_id,
    c.company_name as customer_name,
    b.batch_code,
    b.max_capacity,
    b.current_capacity,
    oba.created_at,
    oba.updated_at
FROM order_batch_assignments oba
LEFT JOIN orders o ON oba.order_id = o.id
LEFT JOIN customers c ON o.customer_id = c.id
LEFT JOIN batches b ON oba.batch_id = b.id;

-- ============================================================================
-- 3. TAILOR MANAGEMENT VIEW
-- ============================================================================
DROP VIEW IF EXISTS tailor_management_view CASCADE;
CREATE VIEW tailor_management_view AS
SELECT
    t.id,
    t.tailor_code,
    t.full_name,
    t.avatar_url,
    t.skill_level,
    t.batch_id,
    t.is_batch_leader,
    t.status,
    t.personal_phone,
    t.personal_email,
    t.joining_date,
    t.employment_type,
    t.per_piece_rate,
    t.total_orders_completed,
    t.average_completion_time,
    t.quality_rating,
    t.efficiency_score,
    b.batch_name,
    b.batch_code,
    b.max_capacity,
    b.current_capacity,
    bl.full_name AS batch_leader_name,
    bl.avatar_url AS batch_leader_avatar,
    (SELECT COUNT(*) FROM tailor_assignments ta WHERE ta.tailor_id = t.id AND ta.status IN ('assigned', 'in_progress')) AS active_assignments,
    (SELECT COUNT(*) FROM tailor_assignments ta WHERE ta.tailor_id = t.id AND ta.status = 'completed') AS completed_assignments,
    t.created_at,
    t.updated_at
FROM tailors t
LEFT JOIN batches b ON t.batch_id = b.id
LEFT JOIN tailors bl ON b.batch_leader_id = bl.id;

-- ============================================================================
-- 4. QC REVIEWS VIEW
-- ============================================================================
DROP VIEW IF EXISTS qc_reviews CASCADE;
CREATE VIEW qc_reviews AS
SELECT
    qc.id,
    qc.order_id,
    qc.production_order_id,
    qc.order_batch_assignment_id,
    qc.check_date,
    qc.checked_by,
    qc.status,
    qc.pass_percentage,
    qc.rework_required,
    qc.notes,
    qc.defects_found,
    o.order_number,
    o.customer_id,
    c.company_name as customer_name,
    po.production_number,
    e.full_name as checker_name,
    e.avatar_url as checker_avatar,
    COALESCE(oi.quantity, 0) as total_quantity,
    ROUND(COALESCE(oi.quantity, 0) * COALESCE(qc.pass_percentage, 0) / 100, 0) as approved_quantity,
    ROUND(COALESCE(oi.quantity, 0) * (100 - COALESCE(qc.pass_percentage, 0)) / 100, 0) as rejected_quantity,
    qc.created_at
FROM quality_checks qc
LEFT JOIN orders o ON qc.order_id = o.id
LEFT JOIN customers c ON o.customer_id = c.id
LEFT JOIN production_orders po ON qc.production_order_id = po.id
LEFT JOIN employees e ON qc.checked_by = e.id
LEFT JOIN (
    SELECT order_id, SUM(quantity) as quantity
    FROM order_items
    GROUP BY order_id
) oi ON qc.order_id = oi.order_id;

-- ============================================================================
-- 5. GOODS RECEIPT NOTES VIEW
-- ============================================================================
DROP VIEW IF EXISTS goods_receipt_notes CASCADE;
CREATE VIEW goods_receipt_notes AS
SELECT 
    gm.id,
    gm.grn_number,
    gm.po_id,
    gm.supplier_id,
    gm.grn_date,
    gm.received_date,
    gm.received_by,
    gm.received_at_location,
    gm.status,
    gm.total_items_received,
    gm.total_items_approved,
    gm.total_items_rejected,
    gm.total_amount_received,
    gm.total_amount_approved,
    po.po_number,
    po.order_date as po_date,
    sm.supplier_name,
    sm.supplier_code,
    gm.created_at,
    gm.updated_at
FROM grn_master gm
LEFT JOIN purchase_orders po ON gm.po_id = po.id
LEFT JOIN supplier_master sm ON gm.supplier_id = sm.id;

-- ============================================================================
-- 6. WAREHOUSE INVENTORY SUMMARY VIEW
-- ============================================================================
DROP VIEW IF EXISTS warehouse_inventory_summary CASCADE;
CREATE VIEW warehouse_inventory_summary AS
SELECT
    wi.id,
    wi.warehouse_id,
    wi.bin_id,
    wi.item_id,
    wi.fabric_id,
    wi.quantity,
    wi.reserved_quantity,
    wi.available_quantity,
    wi.unit,
    wi.batch_number,
    wi.location,
    w.name as warehouse_name,
    w.code as warehouse_code,
    b.bin_code,
    b.location_type as bin_location_type,
    COALESCE(im.item_name, f.name) as item_name,
    COALESCE(im.item_code, '') as item_code,
    wi.last_updated,
    wi.created_at
FROM warehouse_inventory wi
LEFT JOIN warehouses w ON wi.warehouse_id = w.id
LEFT JOIN bins b ON wi.bin_id = b.id
LEFT JOIN item_master im ON wi.item_id = im.id
LEFT JOIN fabrics f ON wi.fabric_id = f.id;

-- ============================================================================
-- 7. FABRIC STOCK SUMMARY VIEW
-- ============================================================================
DROP VIEW IF EXISTS fabric_stock_summary CASCADE;
CREATE VIEW fabric_stock_summary AS
SELECT
    f.id as fabric_id,
    f.name as fabric_name,
    fv.id as variant_id,
    fv.color,
    fv.gsm,
    fv.hex_code,
    COALESCE(SUM(fi.quantity), 0) as total_quantity,
    COALESCE(SUM(fi.reserved_quantity), 0) as total_reserved,
    COALESCE(SUM(fi.available_quantity), 0) as total_available,
    fv.uom as unit,
    fv.rate_per_meter,
    fv.stock_quantity as variant_stock,
    COUNT(DISTINCT fi.warehouse_id) as warehouse_count,
    f.image_url,
    fv.image_url as variant_image_url
FROM fabrics f
LEFT JOIN fabric_variants fv ON f.id = fv.fabric_id
LEFT JOIN fabric_inventory fi ON fv.id = fi.fabric_id
GROUP BY f.id, f.name, fv.id, fv.color, fv.gsm, fv.hex_code, fv.uom, fv.rate_per_meter, 
         fv.stock_quantity, f.image_url, fv.image_url;

-- ============================================================================
-- 8. ORDER CUTTING ASSIGNMENTS VIEW
-- ============================================================================
DROP VIEW IF EXISTS order_cutting_assignments CASCADE;
CREATE VIEW order_cutting_assignments AS
SELECT
    oa.id,
    oa.order_id,
    oa.cutting_master_id,
    oa.cutting_master_name,
    oa.cutting_work_date,
    oa.pattern_master_id,
    oa.pattern_master_name,
    oa.pattern_work_date,
    oa.cut_quantity,
    o.order_number,
    o.customer_id,
    c.company_name as customer_name,
    cm.full_name as cutting_master_full_name,
    cm.avatar_url as cutting_master_avatar,
    pm.full_name as pattern_master_full_name,
    pm.avatar_url as pattern_master_avatar,
    oa.created_at,
    oa.updated_at
FROM order_assignments oa
LEFT JOIN orders o ON oa.order_id = o.id
LEFT JOIN customers c ON o.customer_id = c.id
LEFT JOIN employees cm ON oa.cutting_master_id = cm.id
LEFT JOIN employees pm ON oa.pattern_master_id = pm.id;

-- ============================================================================
-- 9. DISPATCH SUMMARY VIEW
-- ============================================================================
DROP VIEW IF EXISTS dispatch_summary CASCADE;
CREATE VIEW dispatch_summary AS
SELECT
    d.id as dispatch_id,
    d.dispatch_number,
    d.order_id,
    d.dispatch_date,
    d.courier_name,
    d.tracking_number,
    d.status,
    d.delivery_address,
    o.order_number,
    o.customer_id,
    c.company_name as customer_name,
    c.contact_person,
    c.phone as customer_phone,
    COALESCE(SUM(doi.quantity), 0) as total_dispatched_quantity,
    COUNT(DISTINCT doi.size_name) as size_count,
    d.created_at,
    d.updated_at
FROM dispatch_orders d
LEFT JOIN orders o ON d.order_id = o.id
LEFT JOIN customers c ON o.customer_id = c.id
LEFT JOIN dispatch_order_items doi ON d.id = doi.dispatch_order_id
GROUP BY d.id, d.dispatch_number, d.order_id, d.dispatch_date, d.courier_name, 
         d.tracking_number, d.status, d.delivery_address, o.order_number, 
         o.customer_id, c.company_name, c.contact_person, c.phone, d.created_at, d.updated_at;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

SELECT 'Successfully created all 9 views!' as status;

