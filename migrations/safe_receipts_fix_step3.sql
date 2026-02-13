-- SAFE RECEIPTS FIX - STEP 3: Create new function
-- Run this after Step 2 completes successfully

-- Create the receipt number generation function
CREATE FUNCTION generate_receipt_number()
RETURNS TRIGGER AS $$
DECLARE
    seq_num INTEGER;
    receipt_num TEXT;
BEGIN
    -- Get next sequence number starting from 1
    SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM 'TUC/REC/(\d+)$') AS INTEGER)), 0) + 1
    INTO seq_num
    FROM receipts
    WHERE receipt_number LIKE 'TUC/REC/%';
    
    -- Generate receipt number with TUC/REC/ prefix and 4-digit sequence
    receipt_num := 'TUC/REC/' || LPAD(seq_num::TEXT, 4, '0');
    
    NEW.receipt_number := receipt_num;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Verify function was created
SELECT 'Function created successfully' as status;
