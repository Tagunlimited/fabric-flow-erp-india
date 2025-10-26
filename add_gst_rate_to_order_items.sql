-- Add gst_rate column to order_items table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'gst_rate') THEN
        ALTER TABLE order_items ADD COLUMN gst_rate DECIMAL(5,2) DEFAULT 0;
        RAISE NOTICE 'Column gst_rate added to order_items table.';
    ELSE
        RAISE NOTICE 'Column gst_rate already exists in order_items table, skipping add.';
    END IF;
END $$;

-- Update existing order_items to extract gst_rate from specifications if available
UPDATE order_items 
SET gst_rate = COALESCE(
    (specifications->>'gst_rate')::DECIMAL(5,2),
    0
)
WHERE gst_rate = 0 
AND specifications IS NOT NULL 
AND specifications ? 'gst_rate';

-- Verify the table structure after the change
SELECT 'Updated order_items table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'order_items'
ORDER BY ordinal_position;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
