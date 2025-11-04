-- Quick fix for inventory_adjustments foreign key constraint
-- Run this if the table already exists and you're getting foreign key errors

-- 1. Make adjusted_by nullable in inventory_adjustments (remove NOT NULL constraint)
ALTER TABLE inventory_adjustments 
ALTER COLUMN adjusted_by DROP NOT NULL;

-- 2. Add adjusted_by_user_id column to inventory_adjustments if it doesn't exist
ALTER TABLE inventory_adjustments 
ADD COLUMN IF NOT EXISTS adjusted_by_user_id UUID;

-- 3. Make adjusted_by nullable in inventory_adjustment_logs (remove NOT NULL constraint)
ALTER TABLE inventory_adjustment_logs 
ALTER COLUMN adjusted_by DROP NOT NULL;

-- 4. Add adjusted_by_user_id column to inventory_adjustment_logs if it doesn't exist
ALTER TABLE inventory_adjustment_logs 
ADD COLUMN IF NOT EXISTS adjusted_by_user_id UUID;

-- 5. Update the execute_inventory_adjustment function to handle null adjusted_by
-- Run the complete migration file to get the updated function

