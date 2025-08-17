-- Add item_code to BOM record items to use codes as identifiers
alter table if exists public.bom_items
  add column if not exists item_code text;


