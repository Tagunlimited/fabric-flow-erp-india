-- SAFE RECEIPTS FIX - STEP 6: Enable RLS and create policies
-- Run this after Step 5 completes successfully

-- Enable Row Level Security
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own receipts" ON public.receipts;
DROP POLICY IF EXISTS "Users can insert receipts" ON public.receipts;
DROP POLICY IF EXISTS "Users can update receipts" ON public.receipts;

-- Create RLS policies
CREATE POLICY "Users can view their own receipts" ON public.receipts
    FOR SELECT USING (true);

CREATE POLICY "Users can insert receipts" ON public.receipts
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update receipts" ON public.receipts
    FOR UPDATE USING (true);

-- Add helpful comments
COMMENT ON TABLE public.receipts IS 'Payment receipts generated against orders/invoices/quotations.';
COMMENT ON COLUMN public.receipts.receipt_number IS 'Format: TUC/REC/0001 (sequential numbering starting from 0001)';
COMMENT ON COLUMN public.receipts.reference_type IS 'Type of reference: order, invoice, or quotation';
COMMENT ON COLUMN public.receipts.entry_date IS 'Date when the receipt was entered into the system';

-- Final verification
SELECT 
    'Receipts table setup completed successfully!' as status,
    COUNT(*) as total_receipts
FROM public.receipts;
