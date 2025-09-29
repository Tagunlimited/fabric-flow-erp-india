-- Add tailor-type price columns to order_assignments for cutting and pattern masters

alter table if exists public.order_assignments
  add column if not exists cutting_price_single_needle numeric(10,2),
  add column if not exists cutting_price_overlock_flatlock numeric(10,2),
  add column if not exists pattern_price_single_needle numeric(10,2),
  add column if not exists pattern_price_overlock_flatlock numeric(10,2);

comment on column public.order_assignments.cutting_price_single_needle is 'Per-piece price for Single Needle work set at cutting assignment time';
comment on column public.order_assignments.cutting_price_overlock_flatlock is 'Per-piece price for Overlock/Flatlock work set at cutting assignment time';
comment on column public.order_assignments.pattern_price_single_needle is 'Per-piece price for Single Needle work set at pattern assignment time';
comment on column public.order_assignments.pattern_price_overlock_flatlock is 'Per-piece price for Overlock/Flatlock work set at pattern assignment time';


