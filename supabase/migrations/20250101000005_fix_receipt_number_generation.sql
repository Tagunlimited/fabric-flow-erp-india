-- Fix receipt number generation to prevent duplicate key constraint violations
-- This migration adds a database trigger to auto-generate receipt numbers atomically

-- Create sequence for receipt numbers (if not exists)
CREATE SEQUENCE IF NOT EXISTS receipts_sequence_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Create function to generate receipt numbers
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TRIGGER AS $$
DECLARE
    fy_start INTEGER;
    fy_end INTEGER;
    month_str TEXT;
    seq_num INTEGER;
    receipt_num TEXT;
BEGIN
    -- Calculate financial year (April to March)
    IF EXTRACT(MONTH FROM NEW.created_at) < 4 THEN
        fy_start := EXTRACT(YEAR FROM NEW.created_at) - 1;
    ELSE
        fy_start := EXTRACT(YEAR FROM NEW.created_at);
    END IF;
    fy_end := fy_start + 1;
    
    -- Get month abbreviation
    month_str := UPPER(TO_CHAR(NEW.created_at, 'Mon'));
    
    -- Get next sequence number for this month
    SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM '(\d+)$') AS INTEGER)), 0) + 1
    INTO seq_num
    FROM receipts
    WHERE receipt_number LIKE 'RCP/' || LPAD(fy_start::TEXT, 2, '0') || '-' || LPAD(fy_end::TEXT, 2, '0') || '/' || month_str || '/%';
    
    -- Generate receipt number
    receipt_num := 'RCP/' || LPAD(fy_start::TEXT, 2, '0') || '-' || LPAD(fy_end::TEXT, 2, '0') || '/' || month_str || '/' || LPAD(seq_num::TEXT, 3, '0');
    
    NEW.receipt_number := receipt_num;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS receipts_generate_number ON receipts;

-- Create trigger to auto-generate receipt numbers
CREATE TRIGGER receipts_generate_number
    BEFORE INSERT ON receipts
    FOR EACH ROW
    WHEN (NEW.receipt_number IS NULL OR NEW.receipt_number = '')
    EXECUTE FUNCTION generate_receipt_number();

-- Add comment explaining the new behavior
COMMENT ON FUNCTION generate_receipt_number() IS 'Auto-generates receipt numbers in format RCP/YY-YY/MON/SEQ to prevent duplicate constraint violations';
