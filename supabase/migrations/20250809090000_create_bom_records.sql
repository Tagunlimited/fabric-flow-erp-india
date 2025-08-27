-- Create BOM record tables to store generated BOMs per order/product
create table if not exists public.bom_records (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  product_name text,
  product_image_url text,
  total_order_qty numeric,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);

create table if not exists public.bom_items (
  id uuid primary key default gen_random_uuid(),
  bom_id uuid not null references public.bom_records(id) on delete cascade,
  item_id uuid references public.item_master(id) on delete set null,
  item_name text,
  category text,
  unit_of_measure text,
  qty_per_product numeric,
  qty_total numeric,
  stock numeric default 0,
  to_order numeric default 0,
  created_at timestamptz default now()
);

alter table public.bom_records enable row level security;
alter table public.bom_items enable row level security;

create policy "auth manage bom_records" on public.bom_records for all to authenticated using (true) with check (true);
create policy "auth manage bom_items" on public.bom_items for all to authenticated using (true) with check (true);


