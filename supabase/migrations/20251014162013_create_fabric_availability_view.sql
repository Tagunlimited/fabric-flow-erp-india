-- Create view for fabric availability by order
CREATE OR REPLACE VIEW fabric_availability_by_order AS
SELECT 
    o.id as order_id,
    o.order_number,
    fm.id as fabric_id,
    fm.fabric_name,
    fm.color,
    fm.gsm,
    fm.image as fabric_image,
    COALESCE(SUM(fi.available_quantity), 0) as total_available_quantity,
    COALESCE(SUM(fi.reserved_quantity), 0) as total_reserved_quantity,
    COALESCE(SUM(fi.available_quantity), 0) as net_available_quantity,
    fi.unit
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
JOIN fabrics fm ON oi.fabric_id = fm.id
LEFT JOIN fabric_inventory fi ON fm.id = fi.fabric_id
GROUP BY o.id, o.order_number, fm.id, fm.fabric_name, fm.color, fm.gsm, fm.image, fi.unit;

-- Grant permissions
GRANT SELECT ON fabric_availability_by_order TO authenticated;
