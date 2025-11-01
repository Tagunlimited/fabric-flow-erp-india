-- Fix fabric_id foreign key constraint in fabric_usage_records table
-- Change from referencing fabrics table to fabric_master table (which is actually used)

-- Step 1: Drop the existing foreign key constraint if it exists
DO $$
BEGIN
    -- Check if constraint exists and drop it
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE table_name = 'fabric_usage_records' 
        AND constraint_name = 'fabric_usage_records_fabric_id_fkey'
    ) THEN
        ALTER TABLE fabric_usage_records 
        DROP CONSTRAINT fabric_usage_records_fabric_id_fkey;
        
        RAISE NOTICE 'Dropped existing fabric_id foreign key constraint';
    END IF;
END $$;

-- Step 2: Add new foreign key constraint referencing fabric_master table
DO $$
BEGIN
    -- Check if fabric_master table exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'fabric_master'
    ) THEN
        -- Add foreign key to fabric_master
        ALTER TABLE fabric_usage_records 
        ADD CONSTRAINT fabric_usage_records_fabric_id_fkey 
        FOREIGN KEY (fabric_id) REFERENCES fabric_master(id) ON DELETE CASCADE;
        
        RAISE NOTICE 'Added foreign key constraint to fabric_master table';
    ELSE
        RAISE NOTICE 'fabric_master table does not exist, skipping foreign key creation';
    END IF;
END $$;

-- Step 3: Update column comment
COMMENT ON COLUMN fabric_usage_records.fabric_id IS 'Reference to fabric_master table';

