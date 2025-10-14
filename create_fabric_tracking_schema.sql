-- Fabric Tracking System Database Schema
-- This script creates tables for tracking fabric picking and usage in cutting operations

-- 1. Fabric Storage Zone table (if not exists)
CREATE TABLE IF NOT EXISTS public.fabric_storage_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_name VARCHAR(100) NOT NULL,
    zone_code VARCHAR(50) UNIQUE NOT NULL,
    location VARCHAR(200),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Fabric Inventory table (tracks fabric quantities in storage)
CREATE TABLE IF NOT EXISTS public.fabric_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fabric_id UUID NOT NULL REFERENCES public.fabric_master(id) ON DELETE CASCADE,
    storage_zone_id UUID NOT NULL REFERENCES public.fabric_storage_zones(id) ON DELETE CASCADE,
    available_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
    reserved_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
    unit VARCHAR(20) DEFAULT 'meters', -- meters, yards, kg, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(fabric_id, storage_zone_id)
);

-- 3. Fabric Picking Records (when cutting master picks fabric)
CREATE TABLE IF NOT EXISTS public.fabric_picking_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    fabric_id UUID NOT NULL REFERENCES public.fabric_master(id) ON DELETE CASCADE,
    storage_zone_id UUID NOT NULL REFERENCES public.fabric_storage_zones(id) ON DELETE CASCADE,
    picked_quantity DECIMAL(10,2) NOT NULL,
    unit VARCHAR(20) DEFAULT 'meters',
    picked_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    picked_by_name VARCHAR(200),
    picking_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Fabric Usage Records (when fabric is actually used in cutting)
CREATE TABLE IF NOT EXISTS public.fabric_usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    fabric_id UUID NOT NULL REFERENCES public.fabric_master(id) ON DELETE CASCADE,
    used_quantity DECIMAL(10,2) NOT NULL,
    unit VARCHAR(20) DEFAULT 'meters',
    used_for_cutting_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    used_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    used_by_name VARCHAR(200),
    cutting_quantity INTEGER, -- number of pieces cut with this fabric
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_fabric_inventory_fabric_zone ON public.fabric_inventory(fabric_id, storage_zone_id);
CREATE INDEX IF NOT EXISTS idx_fabric_picking_order ON public.fabric_picking_records(order_id);
CREATE INDEX IF NOT EXISTS idx_fabric_picking_fabric ON public.fabric_picking_records(fabric_id);
CREATE INDEX IF NOT EXISTS idx_fabric_usage_order ON public.fabric_usage_records(order_id);
CREATE INDEX IF NOT EXISTS idx_fabric_usage_fabric ON public.fabric_usage_records(fabric_id);

-- 6. Create a view for fabric availability by order
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
    COALESCE(SUM(fi.available_quantity - fi.reserved_quantity), 0) as net_available_quantity,
    fi.unit
FROM public.orders o
JOIN public.order_items oi ON o.id = oi.order_id
JOIN public.fabric_master fm ON oi.fabric_id = fm.id
LEFT JOIN public.fabric_inventory fi ON fm.id = fi.fabric_id
GROUP BY o.id, o.order_number, fm.id, fm.fabric_name, fm.color, fm.gsm, fm.image, fi.unit;

-- 7. Create a view for fabric picking summary by order
CREATE OR REPLACE VIEW fabric_picking_summary AS
SELECT 
    fpr.order_id,
    o.order_number,
    fpr.fabric_id,
    fm.fabric_name,
    fm.color,
    fm.gsm,
    SUM(fpr.picked_quantity) as total_picked_quantity,
    fpr.unit,
    COUNT(fpr.id) as picking_sessions,
    MAX(fpr.picking_date) as last_picked_date
FROM public.fabric_picking_records fpr
JOIN public.orders o ON fpr.order_id = o.id
JOIN public.fabric_master fm ON fpr.fabric_id = fm.id
GROUP BY fpr.order_id, o.order_number, fpr.fabric_id, fm.fabric_name, fm.color, fm.gsm, fpr.unit;

-- 8. Create a view for fabric usage summary by order
CREATE OR REPLACE VIEW fabric_usage_summary AS
SELECT 
    fur.order_id,
    o.order_number,
    fur.fabric_id,
    fm.fabric_name,
    fm.color,
    fm.gsm,
    SUM(fur.used_quantity) as total_used_quantity,
    SUM(fur.cutting_quantity) as total_cutting_quantity,
    fur.unit,
    COUNT(fur.id) as usage_sessions,
    MAX(fur.used_for_cutting_date) as last_used_date
FROM public.fabric_usage_records fur
JOIN public.orders o ON fur.order_id = o.id
JOIN public.fabric_master fm ON fur.fabric_id = fm.id
GROUP BY fur.order_id, o.order_number, fur.fabric_id, fm.fabric_name, fm.color, fm.gsm, fur.unit;

-- 9. Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON public.fabric_storage_zones TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.fabric_inventory TO authenticated;
GRANT SELECT, INSERT ON public.fabric_picking_records TO authenticated;
GRANT SELECT, INSERT ON public.fabric_usage_records TO authenticated;
GRANT SELECT ON public.fabric_availability_by_order TO authenticated;
GRANT SELECT ON public.fabric_picking_summary TO authenticated;
GRANT SELECT ON public.fabric_usage_summary TO authenticated;

-- 10. Insert default storage zone
INSERT INTO public.fabric_storage_zones (id, zone_name, zone_code, location, description)
VALUES 
    (gen_random_uuid(), 'Main Storage', 'MAIN', 'Warehouse A - Ground Floor', 'Primary fabric storage area'),
    (gen_random_uuid(), 'Cutting Room Storage', 'CUTTING', 'Cutting Department - Room 1', 'Fabric storage near cutting machines'),
    (gen_random_uuid(), 'Quality Control Storage', 'QC', 'Quality Control Area', 'Fabric storage for QC inspection')
ON CONFLICT (zone_code) DO NOTHING;

-- 11. Create functions for fabric inventory management
CREATE OR REPLACE FUNCTION update_fabric_inventory_on_pick(
    p_fabric_id UUID,
    p_storage_zone_id UUID,
    p_quantity DECIMAL(10,2)
) RETURNS VOID AS $$
BEGIN
    UPDATE public.fabric_inventory 
    SET 
        available_quantity = available_quantity - p_quantity,
        reserved_quantity = reserved_quantity + p_quantity,
        updated_at = NOW()
    WHERE fabric_id = p_fabric_id AND storage_zone_id = p_storage_zone_id;
    
    -- If no inventory record exists, create one with negative available quantity
    IF NOT FOUND THEN
        INSERT INTO public.fabric_inventory (fabric_id, storage_zone_id, available_quantity, reserved_quantity)
        VALUES (p_fabric_id, p_storage_zone_id, -p_quantity, p_quantity);
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_fabric_inventory_on_usage(
    p_fabric_id UUID,
    p_storage_zone_id UUID,
    p_quantity DECIMAL(10,2)
) RETURNS VOID AS $$
BEGIN
    UPDATE public.fabric_inventory 
    SET 
        reserved_quantity = reserved_quantity - p_quantity,
        updated_at = NOW()
    WHERE fabric_id = p_fabric_id AND storage_zone_id = p_storage_zone_id;
END;
$$ LANGUAGE plpgsql;

-- 12. Create triggers for automatic inventory updates
CREATE OR REPLACE FUNCTION trigger_fabric_pick_inventory_update()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM update_fabric_inventory_on_pick(
        NEW.fabric_id,
        NEW.storage_zone_id,
        NEW.picked_quantity
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_fabric_picking_inventory_update
    AFTER INSERT ON public.fabric_picking_records
    FOR EACH ROW
    EXECUTE FUNCTION trigger_fabric_pick_inventory_update();

CREATE OR REPLACE FUNCTION trigger_fabric_usage_inventory_update()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM update_fabric_inventory_on_usage(
        NEW.fabric_id,
        (SELECT storage_zone_id FROM public.fabric_picking_records 
         WHERE order_id = NEW.order_id AND fabric_id = NEW.fabric_id 
         ORDER BY picking_date DESC LIMIT 1),
        NEW.used_quantity
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_fabric_usage_inventory_update
    AFTER INSERT ON public.fabric_usage_records
    FOR EACH ROW
    EXECUTE FUNCTION trigger_fabric_usage_inventory_update();
