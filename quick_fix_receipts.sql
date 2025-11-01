-- Quick fix for receipts table - run this in Supabase SQL Editor
-- Drop existing trigger and function first
DROP TRIGGER IF EXISTS receipts_generate_number ON public.receipts;
DROP FUNCTION IF EXISTS generate_receipt_number();

-- Create the receipts table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    receipt_number VARCHAR(50) UNIQUE,
    reference_type VARCHAR(20) NOT NULL,
    reference_id UUID,
    reference_number VARCHAR(100),
    customer_id UUID REFERENCES public.customers(id),
    payment_mode VARCHAR(50) NOT NULL,
    payment_type VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    reference_txn_id VARCHAR(100),
    entry_date TIMESTAMPTZ NOT NULL,
    verified_by VARCHAR(100),
    notes TEXT,
    status VARCHAR(20) DEFAULT 'active',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ
);

-- Add missing columns if they don't exist
DO $$
BEGIN
    -- Add columns that might be missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'reference_txn_id') THEN
        ALTER TABLE public.receipts ADD COLUMN reference_txn_id VARCHAR(100);
    END IF;
    
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
END $$;

-- Create function to generate receipt numbers
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

-- Create trigger to auto-generate receipt numbers
CREATE TRIGGER receipts_generate_number
    BEFORE INSERT ON public.receipts
    FOR EACH ROW
    WHEN (NEW.receipt_number IS NULL OR NEW.receipt_number = '')
    EXECUTE FUNCTION generate_receipt_number();

-- Enable Row Level Security
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS "Users can view their own receipts" ON public.receipts;
DROP POLICY IF EXISTS "Users can insert receipts" ON public.receipts;
DROP POLICY IF EXISTS "Users can update receipts" ON public.receipts;

CREATE POLICY "Users can view their own receipts" ON public.receipts
    FOR SELECT USING (true);

CREATE POLICY "Users can insert receipts" ON public.receipts
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update receipts" ON public.receipts
    FOR UPDATE USING (true);

-- Add comments
COMMENT ON TABLE public.receipts IS 'Payment receipts generated against orders/invoices/quotations.';
COMMENT ON COLUMN public.receipts.receipt_number IS 'Format: TUC/REC/0001 (sequential numbering starting from 0001)';
COMMENT ON COLUMN public.receipts.reference_type IS 'Type of reference: order, invoice, or quotation';
