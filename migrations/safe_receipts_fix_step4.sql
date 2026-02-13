-- SAFE RECEIPTS FIX - STEP 4: Add missing columns to existing table
-- Run this after Step 3 completes successfully

-- Add missing columns to the existing receipts table
DO $$
BEGIN
    -- Add columns that might be missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'entry_date') THEN
        ALTER TABLE public.receipts ADD COLUMN entry_date TIMESTAMPTZ DEFAULT NOW();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'verified_by') THEN
        ALTER TABLE public.receipts ADD COLUMN verified_by VARCHAR(100);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'notes') THEN
        ALTER TABLE public.receipts ADD COLUMN notes TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'status') THEN
        ALTER TABLE public.receipts ADD COLUMN status VARCHAR(20) DEFAULT 'active';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'updated_at') THEN
        ALTER TABLE public.receipts ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'cancelled_at') THEN
        ALTER TABLE public.receipts ADD COLUMN cancelled_at TIMESTAMPTZ;
    END IF;
    
    RAISE NOTICE 'Columns added successfully';
END $$;

-- Verify columns were added
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'receipts' 
AND table_schema = 'public'
ORDER BY ordinal_position;
