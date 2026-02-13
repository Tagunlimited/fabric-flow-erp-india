-- SAFE RECEIPTS FIX - STEP 5: Create trigger
-- Run this after Step 4 completes successfully

-- Create the trigger for auto-generating receipt numbers
CREATE TRIGGER receipts_generate_number
    BEFORE INSERT ON public.receipts
    FOR EACH ROW
    WHEN (NEW.receipt_number IS NULL OR NEW.receipt_number = '')
    EXECUTE FUNCTION generate_receipt_number();

-- Verify trigger was created
SELECT 'Trigger created successfully' as status;

-- Test the trigger by inserting a test receipt
INSERT INTO public.receipts (
    reference_type,
    reference_number,
    customer_id,
    payment_mode,
    payment_type,
    amount,
    entry_date,
    notes
) VALUES (
    'order',
    'TUC/25-26/OCT/001',
    (SELECT id FROM public.customers LIMIT 1),
    'UPI',
    'Advance',
    1000.00,
    NOW(),
    'Test receipt to verify trigger functionality'
);

-- Check if the test receipt was created with proper number
SELECT 
    receipt_number,
    reference_number,
    amount,
    created_at
FROM public.receipts 
ORDER BY created_at DESC 
LIMIT 1;
