-- Quick fix for calendar_events UUID error
-- Run this in Supabase SQL Editor

-- Update the assigned_to column to TEXT to support JSON arrays
ALTER TABLE calendar_events 
ALTER COLUMN assigned_to TYPE TEXT;

-- Update assigned_by column to TEXT for consistency
ALTER TABLE calendar_events 
ALTER COLUMN assigned_by TYPE TEXT;

-- Verify the change
SELECT 'Schema updated successfully!' as result;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'calendar_events' 
AND column_name IN ('assigned_to', 'assigned_by');
