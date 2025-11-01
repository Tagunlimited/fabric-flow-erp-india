-- Add gst_rate column to order_items table (it's missing!)
-- This is the root cause of GST rate not showing in order details

DO $$
BEGIN
    -- Check if gst_rate column exists in order_items table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_items' 
        AND column_name = 'gst_rate'
        AND table_schema = 'public'
    ) THEN
        -- Add the missing gst_rate column
        ALTER TABLE public.order_items 
        ADD COLUMN gst_rate DECIMAL(5,2) DEFAULT 0;
        
        RAISE NOTICE '✅ Added gst_rate column to order_items table';
    ELSE
        RAISE NOTICE 'ℹ️ gst_rate column already exists in order_items table';
    END IF;
END $$;

-- Update existing order_items to extract gst_rate from specifications if available
UPDATE public.order_items 
SET gst_rate = COALESCE(
    (specifications->>'gst_rate')::DECIMAL(5,2),
    0
)
WHERE gst_rate = 0 
AND specifications IS NOT NULL 
AND specifications ? 'gst_rate';

-- Verify the change
SELECT 
    'order_items table now has gst_rate column' as status,
    COUNT(*) as total_items,
    COUNT(CASE WHEN gst_rate > 0 THEN 1 END) as items_with_gst_rate
FROM public.order_items;

-- Show sample data
SELECT 
    id,
    product_description,
    gst_rate,
    unit_price,
    total_price,
    (specifications->>'gst_rate')::DECIMAL(5,2) as gst_from_specs
FROM public.order_items 
LIMIT 5;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
