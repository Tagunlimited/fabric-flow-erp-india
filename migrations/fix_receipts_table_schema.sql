-- Fix Receipts Table Schema
-- This script ensures the receipts table has the correct structure for the receipt form

-- First, check if the receipts table exists and what columns it has
DO $$
BEGIN
    -- Check if receipts table exists
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'receipts') THEN
        RAISE NOTICE 'Creating receipts table...';
        
        -- Create the receipts table with the correct structure
        CREATE TABLE public.receipts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            receipt_number TEXT NOT NULL UNIQUE,
            
            reference_type TEXT NOT NULL CHECK (reference_type IN ('order','invoice','quotation')),
            reference_id UUID NOT NULL,
            reference_number TEXT,
            
            customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
            
            payment_mode TEXT NOT NULL,
            payment_type TEXT NOT NULL,
            amount NUMERIC(12,2) NOT NULL,
            reference_txn_id TEXT,
            entry_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            verified_by TEXT,
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            cancelled_at TIMESTAMPTZ
        );
        
        -- Create indexes
        CREATE INDEX IF NOT EXISTS receipts_customer_idx ON public.receipts(customer_id);
        CREATE INDEX IF NOT EXISTS receipts_reference_idx ON public.receipts(reference_id);
        CREATE INDEX IF NOT EXISTS receipts_created_at_idx ON public.receipts(created_at DESC);
        CREATE INDEX IF NOT EXISTS receipts_status_idx ON public.receipts(status);
        
    ELSE
        RAISE NOTICE 'Receipts table exists, checking columns...';
        
        -- Add missing columns if they don't exist
        ALTER TABLE public.receipts 
            ADD COLUMN IF NOT EXISTS reference_type TEXT,
            ADD COLUMN IF NOT EXISTS reference_id UUID,
            ADD COLUMN IF NOT EXISTS reference_number TEXT,
            ADD COLUMN IF NOT EXISTS payment_mode TEXT,
            ADD COLUMN IF NOT EXISTS payment_type TEXT,
            ADD COLUMN IF NOT EXISTS reference_txn_id TEXT,
            ADD COLUMN IF NOT EXISTS entry_date TIMESTAMPTZ DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS verified_by TEXT,
            ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
        
        -- Update existing rows to have default values for new columns
        UPDATE public.receipts 
        SET 
            reference_type = 'order',
            payment_mode = 'cash',
            payment_type = 'advance',
            entry_date = COALESCE(entry_date, created_at),
            status = 'active',
            updated_at = NOW()
        WHERE reference_type IS NULL 
           OR payment_mode IS NULL 
           OR payment_type IS NULL 
           OR status IS NULL;
        
        -- Add NOT NULL constraints after setting default values
        ALTER TABLE public.receipts 
            ALTER COLUMN reference_type SET NOT NULL,
            ALTER COLUMN reference_id SET NOT NULL,
            ALTER COLUMN payment_mode SET NOT NULL,
            ALTER COLUMN payment_type SET NOT NULL,
            ALTER COLUMN entry_date SET NOT NULL,
            ALTER COLUMN status SET NOT NULL,
            ALTER COLUMN updated_at SET NOT NULL;
        
        -- Add check constraints (drop first if they exist)
        ALTER TABLE public.receipts DROP CONSTRAINT IF EXISTS receipts_reference_type_check;
        ALTER TABLE public.receipts DROP CONSTRAINT IF EXISTS receipts_status_check;
        
        ALTER TABLE public.receipts 
            ADD CONSTRAINT receipts_reference_type_check 
            CHECK (reference_type IN ('order','invoice','quotation'));
        
        ALTER TABLE public.receipts 
            ADD CONSTRAINT receipts_status_check 
            CHECK (status IN ('active', 'cancelled', 'refunded'));
        
        -- Create indexes if they don't exist
        CREATE INDEX IF NOT EXISTS receipts_customer_idx ON public.receipts(customer_id);
        CREATE INDEX IF NOT EXISTS receipts_reference_idx ON public.receipts(reference_id);
        CREATE INDEX IF NOT EXISTS receipts_created_at_idx ON public.receipts(created_at DESC);
        CREATE INDEX IF NOT EXISTS receipts_status_idx ON public.receipts(status);
        
    END IF;
END $$;

-- Drop existing trigger and function if they exist (to avoid return type conflicts)
DROP TRIGGER IF EXISTS receipts_generate_number ON public.receipts;
DROP FUNCTION IF EXISTS generate_receipt_number();

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
DROP TRIGGER IF EXISTS receipts_generate_number ON public.receipts;
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
COMMENT ON COLUMN public.receipts.reference_id IS 'ID of the referenced order/invoice/quotation';
COMMENT ON COLUMN public.receipts.payment_mode IS 'Payment mode: UPI, Cash, Bank Transfer, etc.';
COMMENT ON COLUMN public.receipts.payment_type IS 'Payment type: Advance, Full Payment, Partial Payment, etc.';

-- Show completion message
SELECT 'Receipts table schema fixed successfully!' as status;
