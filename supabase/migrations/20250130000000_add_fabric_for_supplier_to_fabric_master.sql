-- Migration: Add fabric_for_supplier column to fabric_master table
-- This column will be used to display supplier-specific fabric names in purchase orders

-- Add the column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'fabric_master' 
    AND column_name = 'fabric_for_supplier'
  ) THEN
    ALTER TABLE public.fabric_master 
    ADD COLUMN fabric_for_supplier TEXT;
    
    -- Add comment to the column
    COMMENT ON COLUMN public.fabric_master.fabric_for_supplier IS 'Supplier-specific fabric name to be displayed in purchase orders';
    
    RAISE NOTICE 'Column fabric_for_supplier added to fabric_master table';
  ELSE
    RAISE NOTICE 'Column fabric_for_supplier already exists in fabric_master table';
  END IF;
END $$;
