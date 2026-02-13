-- Add GST rate field to fabric_master table
-- Run this in your Supabase SQL Editor

-- Add gst_rate column to fabric_master table
ALTER TABLE fabric_master 
ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 18.00;

-- Add comment for documentation
COMMENT ON COLUMN fabric_master.gst_rate IS 'GST rate percentage for this fabric (e.g., 18.00 for 18%)';
