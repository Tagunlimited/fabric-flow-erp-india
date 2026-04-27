-- Additive selected_colors support for PO and GRN lines.
alter table if exists public.purchase_order_items
add column if not exists selected_colors jsonb not null default '[]'::jsonb;

alter table if exists public.grn_items
add column if not exists selected_colors jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_order_items_selected_colors_is_array_chk'
      and conrelid = 'public.purchase_order_items'::regclass
  ) then
    alter table public.purchase_order_items
    add constraint purchase_order_items_selected_colors_is_array_chk
    check (jsonb_typeof(selected_colors) = 'array');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'grn_items_selected_colors_is_array_chk'
      and conrelid = 'public.grn_items'::regclass
  ) then
    alter table public.grn_items
    add constraint grn_items_selected_colors_is_array_chk
    check (jsonb_typeof(selected_colors) = 'array');
  end if;
end $$;
