-- FINAL RECEIPTS TABLE FIX
-- This script completely fixes the receipts table and all related issues
-- Run this in Supabase SQL Editor

-- Step 1: Drop all existing receipts-related objects
DROP TRIGGER IF EXISTS receipts_generate_number ON public.receipts;
DROP FUNCTION IF EXISTS generate_receipt_number();
DROP POLICY IF EXISTS "Users can view their own receipts" ON public.receipts;
DROP POLICY IF EXISTS "Users can insert receipts" ON public.receipts;
DROP POLICY IF EXISTS "Users can update receipts" ON public.receipts;

-- Step 2: Drop the table completely and recreate it
DROP TABLE IF EXISTS public.receipts CASCADE;

-- Step 3: Create the receipts table with the correct structure
CREATE TABLE public.receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    receipt_number VARCHAR(50) UNIQUE,
    reference_type VARCHAR(20) NOT NULL CHECK (reference_type IN ('order','invoice','quotation')),
    reference_id UUID,
    reference_number VARCHAR(100),
    customer_id UUID REFERENCES public.customers(id),
    payment_mode VARCHAR(50) NOT NULL,
    payment_type VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    reference_txn_id VARCHAR(100),
    entry_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_by VARCHAR(100),
    notes TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'refunded')),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ
);

-- Step 4: Create indexes for better performance
CREATE INDEX idx_receipts_customer_id ON public.receipts(customer_id);
CREATE INDEX idx_receipts_reference_id ON public.receipts(reference_id);
CREATE INDEX idx_receipts_created_at ON public.receipts(created_at DESC);
CREATE INDEX idx_receipts_status ON public.receipts(status);
CREATE INDEX idx_receipts_receipt_number ON public.receipts(receipt_number);

-- Step 5: Create the receipt number generation function
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

-- Step 6: Create the trigger for auto-generating receipt numbers
CREATE TRIGGER receipts_generate_number
    BEFORE INSERT ON public.receipts
    FOR EACH ROW
    WHEN (NEW.receipt_number IS NULL OR NEW.receipt_number = '')
    EXECUTE FUNCTION generate_receipt_number();

-- Step 7: Enable Row Level Security
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

-- Step 8: Create RLS policies
CREATE POLICY "Users can view their own receipts" ON public.receipts
    FOR SELECT USING (true);

CREATE POLICY "Users can insert receipts" ON public.receipts
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update receipts" ON public.receipts
    FOR UPDATE USING (true);

-- Step 9: Add helpful comments
COMMENT ON TABLE public.receipts IS 'Payment receipts generated against orders/invoices/quotations.';
COMMENT ON COLUMN public.receipts.receipt_number IS 'Format: TUC/REC/0001 (sequential numbering starting from 0001)';
COMMENT ON COLUMN public.receipts.reference_type IS 'Type of reference: order, invoice, or quotation';
COMMENT ON COLUMN public.receipts.reference_id IS 'ID of the referenced order/invoice/quotation';
COMMENT ON COLUMN public.receipts.payment_mode IS 'Payment mode: UPI, Cash, Bank Transfer, etc.';
COMMENT ON COLUMN public.receipts.payment_type IS 'Payment type: Advance, Full Payment, Partial Payment, etc.';
COMMENT ON COLUMN public.receipts.entry_date IS 'Date when the receipt was entered into the system';

-- Step 10: Insert a test receipt to verify everything works
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
    'Test receipt to verify functionality'
);

-- Step 11: Verify the setup
SELECT 
    'Receipts table created successfully!' as status,
    COUNT(*) as test_receipt_count
FROM public.receipts;

-- Show the structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'receipts' 
AND table_schema = 'public'
ORDER BY ordinal_position;
