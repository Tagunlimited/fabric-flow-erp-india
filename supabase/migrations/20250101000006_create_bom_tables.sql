-- Create BOM (Bill of Materials) tables for procurement management
-- This migration creates the missing bom_records and bom_record_items tables

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

create table if not exists public.bom_record_items (
  id uuid primary key default gen_random_uuid(),
  bom_id uuid not null references public.bom_records(id) on delete cascade,
  item_id uuid references public.item_master(id) on delete set null,
  item_code text,
  item_name text,
  category text,
  unit_of_measure text,
  qty_per_product numeric,
  qty_total numeric,
  stock numeric default 0,
  to_order numeric default 0,
  created_at timestamptz default now()
);

-- Enable Row Level Security (RLS) on the new tables
alter table public.bom_records enable row level security;
alter table public.bom_record_items enable row level security;

-- Create RLS policies for authenticated users
create policy "auth manage bom_records" on public.bom_records 
  for all to authenticated using (true) with check (true);

create policy "auth manage bom_record_items" on public.bom_record_items 
  for all to authenticated using (true) with check (true);

-- Create indexes for better performance
create index if not exists idx_bom_records_order_id on public.bom_records(order_id);
create index if not exists idx_bom_records_created_by on public.bom_records(created_by);
create index if not exists idx_bom_record_items_bom_id on public.bom_record_items(bom_id);
create index if not exists idx_bom_record_items_item_id on public.bom_record_items(item_id);

-- Add comments for documentation
comment on table public.bom_records is 'Stores Bill of Materials records for orders and products';
comment on table public.bom_record_items is 'Stores individual items/components that make up each BOM';
comment on column public.bom_records.order_id is 'Reference to the order this BOM belongs to';
comment on column public.bom_records.order_item_id is 'Reference to specific order item if applicable';
comment on column public.bom_records.total_order_qty is 'Total quantity ordered for this product';
comment on column public.bom_record_items.bom_id is 'Reference to the parent BOM record';
comment on column public.bom_record_items.item_id is 'Reference to the item master record';
comment on column public.bom_record_items.qty_per_product is 'Quantity of this item needed per product unit';
comment on column public.bom_record_items.qty_total is 'Total quantity needed for the entire order';
comment on column public.bom_record_items.stock is 'Current available stock of this item';
comment on column public.bom_record_items.to_order is 'Quantity that needs to be ordered';
