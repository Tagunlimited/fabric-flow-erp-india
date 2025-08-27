-- Receipts table for payment acknowledgements

-- Create sequence for receipt numbers
CREATE SEQUENCE IF NOT EXISTS receipts_sequence_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  receipt_number text not null unique,

  reference_type text not null check (reference_type in ('order','invoice','quotation')),
  reference_id uuid not null,
  reference_number text,

  customer_id uuid not null references public.customers(id) on delete restrict,

  payment_mode text not null,
  payment_type text not null,
  amount numeric(12,2) not null,
  reference_txn_id text,
  entry_date timestamptz not null default now(),
  verified_by text,
  notes text
);

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
    -- Calculate financial year
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

-- Create trigger to auto-generate receipt numbers
CREATE TRIGGER receipts_generate_number
    BEFORE INSERT ON receipts
    FOR EACH ROW
    WHEN (NEW.receipt_number IS NULL OR NEW.receipt_number = '')
    EXECUTE FUNCTION generate_receipt_number();

create index if not exists receipts_customer_idx on public.receipts(customer_id);
create index if not exists receipts_reference_idx on public.receipts(reference_id);
create index if not exists receipts_created_at_idx on public.receipts(created_at desc);

comment on table public.receipts is 'Payment receipts generated against orders/invoices/quotations.';
comment on column public.receipts.receipt_number is 'Format: RCP/YY-YY/MON/SEQ';

