-- Receipts table for payment acknowledgements
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

create index if not exists receipts_customer_idx on public.receipts(customer_id);
create index if not exists receipts_reference_idx on public.receipts(reference_id);
create index if not exists receipts_created_at_idx on public.receipts(created_at desc);

comment on table public.receipts is 'Payment receipts generated against orders/invoices/quotations.';
comment on column public.receipts.receipt_number is 'Format: RCP/YY-YY/MON/SEQ';

