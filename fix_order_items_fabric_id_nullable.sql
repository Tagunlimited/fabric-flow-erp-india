-- Fix fabric_id foreign key constraint in order_items table
-- Change from referencing fabrics table to fabric_master table (which is actually used)

-- Step 1: Drop the existing foreign key constraint if it exists
DO $$
BEGIN
    -- Check if constraint exists and drop it
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE table_name = 'order_items' 
        AND constraint_name = 'order_items_fabric_id_fkey'
    ) THEN
        ALTER TABLE order_items 
        DROP CONSTRAINT order_items_fabric_id_fkey;
        
        RAISE NOTICE 'Dropped existing fabric_id foreign key constraint';
    END IF;
END $$;

-- Step 2: Make the column nullable (if not already)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'order_items' 
        AND column_name = 'fabric_id'
        AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE order_items 
        ALTER COLUMN fabric_id DROP NOT NULL;
        
        RAISE NOTICE 'Made fabric_id nullable in order_items table';
    END IF;
END $$;

-- Step 3: Add new foreign key constraint referencing fabric_master table
DO $$
BEGIN
    -- Check if fabric_master table exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'fabric_master'
    ) THEN
        -- Add foreign key to fabric_master
        ALTER TABLE order_items 
        ADD CONSTRAINT order_items_fabric_id_fkey 
        FOREIGN KEY (fabric_id) REFERENCES fabric_master(id);
        
        RAISE NOTICE 'Added foreign key constraint to fabric_master table';
    ELSE
        RAISE NOTICE 'fabric_master table does not exist, skipping foreign key creation';
    END IF;
END $$;

-- Step 4: Update column comment
COMMENT ON COLUMN order_items.fabric_id IS 'Reference to fabric_master table. Can be NULL.';
