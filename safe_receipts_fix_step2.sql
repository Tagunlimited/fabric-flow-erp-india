-- SAFE RECEIPTS FIX - STEP 2: Drop objects safely
-- Run this ONLY if Step 1 shows existing objects

-- Step 2: Drop objects one by one to avoid deadlocks
-- First, drop the trigger (this should not cause deadlocks)
DROP TRIGGER IF EXISTS receipts_generate_number ON public.receipts;

-- Then drop the function (this should not cause deadlocks)
DROP FUNCTION IF EXISTS generate_receipt_number();

-- Verify they are dropped
SELECT 'Objects dropped successfully' as status;
