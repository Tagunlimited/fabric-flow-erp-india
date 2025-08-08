-- Add status and timestamps to receipts for edit/cancel workflows
alter table public.receipts
  add column if not exists status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists cancelled_at timestamptz;

create index if not exists receipts_status_idx on public.receipts(status);

comment on column public.receipts.status is 'active | cancelled';

