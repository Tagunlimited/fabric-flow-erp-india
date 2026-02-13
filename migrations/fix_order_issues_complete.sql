-- Complete fix for order detail page and design page issues
-- This script addresses:
-- 1. Order detail page not showing order items (missing table columns)
-- 2. Design page showing orders without receipts (receipts table issues)

-- ============================================
-- PART 1: Fix order_items table structure
-- ============================================

SELECT '=== FIXING ORDER_ITEMS TABLE STRUCTURE ===' as info;

-- Check if order_items table exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'order_items') THEN
        RAISE NOTICE 'order_items table does not exist. Creating it...';
        
        CREATE TABLE order_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            product_id UUID REFERENCES products(id),
            product_category_id UUID REFERENCES product_categories(id),
            product_description TEXT,
            fabric_id UUID REFERENCES fabrics(id),
            color TEXT,
            gsm TEXT,
            quantity INTEGER NOT NULL,
            unit_price DECIMAL(12,2) NOT NULL,
            total_price DECIMAL(12,2) NOT NULL,
            gst_rate DECIMAL(5,2) DEFAULT 0,
            sizes_quantities JSONB,
            specifications JSONB,
            remarks TEXT,
            category_image_url TEXT,
            reference_images TEXT[],
            mockup_images TEXT[],
            attachments TEXT[],
            size_type_id UUID REFERENCES size_types(id),
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        -- Enable RLS
        ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
        
        -- Create RLS policies
        CREATE POLICY "Allow all operations for authenticated users" ON order_items
            FOR ALL USING (auth.role() = 'authenticated');
            
        RAISE NOTICE 'order_items table created successfully.';
    ELSE
        RAISE NOTICE 'order_items table exists. Checking for missing columns...';
    END IF;
END $$;

-- Add missing columns to existing order_items table
DO $$
BEGIN
    -- Add product_category_id if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'product_category_id') THEN
        ALTER TABLE order_items ADD COLUMN product_category_id UUID REFERENCES product_categories(id);
        RAISE NOTICE 'Added product_category_id column to order_items table.';
    END IF;

    -- Add product_description if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'product_description') THEN
        ALTER TABLE order_items ADD COLUMN product_description TEXT;
        RAISE NOTICE 'Added product_description column to order_items table.';
    END IF;

    -- Add fabric_id if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'fabric_id') THEN
        ALTER TABLE order_items ADD COLUMN fabric_id UUID REFERENCES fabrics(id);
        RAISE NOTICE 'Added fabric_id column to order_items table.';
    END IF;

    -- Add color if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'color') THEN
        ALTER TABLE order_items ADD COLUMN color TEXT;
        RAISE NOTICE 'Added color column to order_items table.';
    END IF;

    -- Add gsm if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'gsm') THEN
        ALTER TABLE order_items ADD COLUMN gsm TEXT;
        RAISE NOTICE 'Added gsm column to order_items table.';
    END IF;

    -- Add sizes_quantities if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'sizes_quantities') THEN
        ALTER TABLE order_items ADD COLUMN sizes_quantities JSONB;
        RAISE NOTICE 'Added sizes_quantities column to order_items table.';
    END IF;

    -- Add specifications if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'specifications') THEN
        ALTER TABLE order_items ADD COLUMN specifications JSONB;
        RAISE NOTICE 'Added specifications column to order_items table.';
    END IF;

    -- Add remarks if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'remarks') THEN
        ALTER TABLE order_items ADD COLUMN remarks TEXT;
        RAISE NOTICE 'Added remarks column to order_items table.';
    END IF;

    -- Add category_image_url if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'category_image_url') THEN
        ALTER TABLE order_items ADD COLUMN category_image_url TEXT;
        RAISE NOTICE 'Added category_image_url column to order_items table.';
    END IF;

    -- Add reference_images if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'reference_images') THEN
        ALTER TABLE order_items ADD COLUMN reference_images TEXT[];
        RAISE NOTICE 'Added reference_images column to order_items table.';
    END IF;

    -- Add mockup_images if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'mockup_images') THEN
        ALTER TABLE order_items ADD COLUMN mockup_images TEXT[];
        RAISE NOTICE 'Added mockup_images column to order_items table.';
    END IF;

    -- Add attachments if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'attachments') THEN
        ALTER TABLE order_items ADD COLUMN attachments TEXT[];
        RAISE NOTICE 'Added attachments column to order_items table.';
    END IF;

    -- Add size_type_id if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'size_type_id') THEN
        ALTER TABLE order_items ADD COLUMN size_type_id UUID REFERENCES size_types(id);
        RAISE NOTICE 'Added size_type_id column to order_items table.';
    END IF;

    -- Add gst_rate if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'gst_rate') THEN
        ALTER TABLE order_items ADD COLUMN gst_rate DECIMAL(5,2) DEFAULT 0;
        RAISE NOTICE 'Added gst_rate column to order_items table.';
    END IF;

    RAISE NOTICE 'order_items table structure update completed.';
END $$;

-- ============================================
-- PART 2: Fix receipts table structure
-- ============================================

SELECT '=== FIXING RECEIPTS TABLE STRUCTURE ===' as info;

-- Check if receipts table exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'receipts') THEN
        RAISE NOTICE 'receipts table does not exist. Creating it...';
        
        CREATE TABLE receipts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            receipt_number TEXT UNIQUE,
            amount DECIMAL(12,2) NOT NULL,
            payment_method TEXT,
            reference_id UUID,
            reference_number TEXT,
            reference_type TEXT,
            status TEXT DEFAULT 'active',
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        -- Enable RLS
        ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
        
        -- Create RLS policies
        CREATE POLICY "Allow all operations for authenticated users" ON receipts
            FOR ALL USING (auth.role() = 'authenticated');
            
        RAISE NOTICE 'receipts table created successfully.';
    ELSE
        RAISE NOTICE 'receipts table exists. Checking for missing columns...';
    END IF;
END $$;

-- Add missing columns to existing receipts table
DO $$
BEGIN
    -- Add reference_id if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'reference_id') THEN
        ALTER TABLE receipts ADD COLUMN reference_id UUID;
        RAISE NOTICE 'Added reference_id column to receipts table.';
    END IF;

    -- Add reference_number if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'reference_number') THEN
        ALTER TABLE receipts ADD COLUMN reference_number TEXT;
        RAISE NOTICE 'Added reference_number column to receipts table.';
    END IF;

    -- Add reference_type if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'reference_type') THEN
        ALTER TABLE receipts ADD COLUMN reference_type TEXT;
        RAISE NOTICE 'Added reference_type column to receipts table.';
    END IF;

    -- Add status if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'status') THEN
        ALTER TABLE receipts ADD COLUMN status TEXT DEFAULT 'active';
        RAISE NOTICE 'Added status column to receipts table.';
    END IF;

    RAISE NOTICE 'receipts table structure update completed.';
END $$;

-- ============================================
-- PART 3: Verify and report results
-- ============================================

SELECT '=== VERIFICATION RESULTS ===' as info;

-- Check order_items table structure
SELECT 'Order Items Table Structure:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'order_items'
ORDER BY ordinal_position;

-- Check receipts table structure
SELECT 'Receipts Table Structure:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'receipts'
ORDER BY ordinal_position;

-- Check order_items count
SELECT 'Order Items Count:' as info;
SELECT COUNT(*) as total_order_items FROM order_items;

-- Check receipts count
SELECT 'Receipts Count:' as info;
SELECT COUNT(*) as total_receipts FROM receipts;

-- Check orders with receipts
SELECT 'Orders with Receipts:' as info;
SELECT 
    o.id,
    o.order_number,
    o.order_date,
    COUNT(r.id) as receipt_count
FROM orders o
LEFT JOIN receipts r ON (r.reference_id = o.id OR r.reference_number = o.order_number) 
    AND r.reference_type IN ('order', 'ORDER')
GROUP BY o.id, o.order_number, o.order_date
HAVING COUNT(r.id) > 0
ORDER BY o.order_date DESC
LIMIT 5;

-- Check orders without receipts
SELECT 'Orders without Receipts:' as info;
SELECT 
    o.id,
    o.order_number,
    o.order_date,
    o.status
FROM orders o
LEFT JOIN receipts r ON (r.reference_id = o.id OR r.reference_number = o.order_number) 
    AND r.reference_type IN ('order', 'ORDER')
WHERE r.id IS NULL
ORDER BY o.order_date DESC
LIMIT 5;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

SELECT '=== FIX COMPLETED ===' as info;
