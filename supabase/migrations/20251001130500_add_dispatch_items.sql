-- Add items table for per-size partial dispatch tracking

create table if not exists public.dispatch_order_items (
  id uuid primary key default gen_random_uuid(),
  dispatch_order_id uuid not null references public.dispatch_orders(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_batch_assignment_id uuid references public.order_batch_assignments(id) on delete set null,
  size_name text,
  quantity integer not null check (quantity >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_dispatch_order_items_dispatch on public.dispatch_order_items(dispatch_order_id);
create index if not exists idx_dispatch_order_items_order on public.dispatch_order_items(order_id);

comment on table public.dispatch_order_items is 'Per-line dispatch quantities to support partial dispatch by size/assignment';


