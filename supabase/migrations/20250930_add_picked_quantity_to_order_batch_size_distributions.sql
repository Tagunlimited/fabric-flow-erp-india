-- Add picked_quantity column to track size-wise picked pieces per batch assignment
-- Safe to run multiple times due to IF NOT EXISTS guards

alter table if exists public.order_batch_size_distributions
  add column if not exists picked_quantity integer not null default 0;

comment on column public.order_batch_size_distributions.picked_quantity is 'Number of pieces picked for this size in this batch assignment';

-- Optional: simple index if querying by picked_quantity becomes common
-- create index if not exists idx_obsd_picked_quantity on public.order_batch_size_distributions(picked_quantity);


