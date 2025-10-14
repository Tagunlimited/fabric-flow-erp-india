-- Complete fix for calendar_events table to support multiple employee assignments
-- This script ensures the table exists with the correct schema

-- Drop existing table if it exists (be careful in production!)
-- DROP TABLE IF EXISTS calendar_events CASCADE;

-- Create or update calendar_events table with proper schema
CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('delivery', 'production', 'payment', 'meeting', 'cutting', 'quality', 'task', 'event')),
    time TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'overdue', 'cancelled')),
    details TEXT,
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    department TEXT,
    assigned_to TEXT, -- Changed to TEXT to support JSON arrays of employee IDs
    assigned_by TEXT, -- Changed to TEXT for consistency
    deadline TEXT,
    date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update existing columns if table already exists
DO $$
BEGIN
    -- Update assigned_to column to TEXT if it exists as UUID
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'calendar_events' 
               AND column_name = 'assigned_to' 
               AND data_type = 'uuid') THEN
        ALTER TABLE calendar_events ALTER COLUMN assigned_to TYPE TEXT;
    END IF;
    
    -- Update assigned_by column to TEXT if it exists as UUID
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'calendar_events' 
               AND column_name = 'assigned_by' 
               AND data_type = 'uuid') THEN
        ALTER TABLE calendar_events ALTER COLUMN assigned_by TYPE TEXT;
    END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_type ON calendar_events(type);
CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON calendar_events(status);
CREATE INDEX IF NOT EXISTS idx_calendar_events_department ON calendar_events(department);

-- Enable RLS
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON calendar_events;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON calendar_events;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON calendar_events;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON calendar_events;

-- Create RLS policies
CREATE POLICY "Enable read access for authenticated users" ON calendar_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON calendar_events
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users" ON calendar_events
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable delete access for authenticated users" ON calendar_events
  FOR DELETE TO authenticated USING (true);

-- Create trigger function for automatic timestamp updates if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_calendar_events_updated_at ON calendar_events;
CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Test the schema with a sample insert
INSERT INTO calendar_events (
  title, 
  type, 
  status, 
  priority, 
  assigned_to, 
  department,
  date
) VALUES (
  'Test Multi-Assignment Event',
  'task',
  'pending',
  'medium',
  '["6e043042-0f1b-48cd-a5c9-b8f291fd31c5", "c3162351-b3ce-4d53-93df-58377a061469"]',
  'Production',
  CURRENT_DATE
) ON CONFLICT DO NOTHING;

-- Verify the final schema
SELECT 'Final calendar_events schema:' as info;
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'calendar_events' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Show sample data
SELECT 'Sample calendar_events data:' as info;
SELECT id, title, assigned_to, department, date 
FROM calendar_events 
ORDER BY created_at DESC 
LIMIT 5;

SELECT 'Calendar events table setup completed successfully!' as result;
