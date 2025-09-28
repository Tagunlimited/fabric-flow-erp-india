-- Create order_assignments table to persist production assignments
create table if not exists public.order_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  cutting_master_id uuid null references public.employees(id) on delete set null,
  cutting_master_name text null,
  cutting_work_date date null,
  pattern_master_id uuid null references public.employees(id) on delete set null,
  pattern_master_name text null,
  pattern_work_date date null,
  cut_quantity numeric null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_order_assignments_order unique(order_id)
);

-- Trigger to update updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_order_assignments_updated_at on public.order_assignments;
create trigger trg_order_assignments_updated_at
before update on public.order_assignments
for each row execute function public.set_updated_at();

-- Indexes
create index if not exists idx_order_assignments_order_id on public.order_assignments(order_id);
create index if not exists idx_order_assignments_cutting_master_id on public.order_assignments(cutting_master_id);
create index if not exists idx_order_assignments_pattern_master_id on public.order_assignments(pattern_master_id);

-- Enable RLS and allow authenticated users to manage
alter table public.order_assignments enable row level security;

drop policy if exists "auth select order_assignments" on public.order_assignments;
drop policy if exists "auth manage order_assignments" on public.order_assignments;

create policy "auth select order_assignments" on public.order_assignments
  for select to authenticated using (true);

create policy "auth manage order_assignments" on public.order_assignments
  for all to authenticated using (true) with check (true);

