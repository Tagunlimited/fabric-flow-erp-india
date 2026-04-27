-- Additive, non-breaking support for multi-color BOM fabric rows.
alter table if exists public.bom_record_items
add column if not exists selected_colors jsonb not null default '[]'::jsonb;

-- Guard shape to array for any future writes.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bom_record_items_selected_colors_is_array_chk'
      and conrelid = 'public.bom_record_items'::regclass
  ) then
    alter table public.bom_record_items
    add constraint bom_record_items_selected_colors_is_array_chk
    check (jsonb_typeof(selected_colors) = 'array');
  end if;
end $$;
