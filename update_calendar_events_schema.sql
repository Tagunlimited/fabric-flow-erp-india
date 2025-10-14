-- Update calendar_events table to support multiple employee assignments
-- This changes the assigned_to field from UUID to TEXT to store JSON arrays

-- First, let's check the current schema
SELECT 'Current calendar_events schema:' as info;
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'calendar_events' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Update the assigned_to column to TEXT to support JSON arrays
ALTER TABLE calendar_events 
ALTER COLUMN assigned_to TYPE TEXT;

-- Also update assigned_by to TEXT for consistency (in case we want to support multiple assigners in future)
ALTER TABLE calendar_events 
ALTER COLUMN assigned_by TYPE TEXT;

-- Verify the updated schema
SELECT 'Updated calendar_events schema:' as info;
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'calendar_events' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Test inserting a sample record with JSON array
INSERT INTO calendar_events (
  title, 
  type, 
  status, 
  priority, 
  assigned_to, 
  date
) VALUES (
  'Test Multi-Assignment Event',
  'task',
  'pending',
  'medium',
  '["6e043042-0f1b-48cd-a5c9-b8f291fd31c5", "c3162351-b3ce-4d53-93df-58377a061469"]',
  CURRENT_DATE
);

-- Verify the test record was inserted
SELECT 'Test record inserted:' as info;
SELECT id, title, assigned_to FROM calendar_events WHERE title = 'Test Multi-Assignment Event';

-- Clean up test record
DELETE FROM calendar_events WHERE title = 'Test Multi-Assignment Event';

SELECT 'Schema update completed successfully!' as result;
