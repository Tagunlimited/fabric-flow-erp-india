-- One-time backfill for stale order statuses after recalc logic updates.

do $$
declare
  r record;
begin
  for r in
    select id
    from public.orders
    where status not in ('cancelled', 'completed')
  loop
    perform public.recalc_order_status(r.id);
  end loop;
end $$;

select 'order status backfill recalc complete' as status;
